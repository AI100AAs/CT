from __future__ import annotations

import math
import re
import secrets
import sqlite3
import json
from datetime import UTC, datetime
from typing import Any

from flask import Flask, Response, current_app, g, jsonify, request, stream_with_context
from werkzeug.exceptions import BadRequest, HTTPException, RequestEntityTooLarge, UnsupportedMediaType

from .capabilities import capability_payload
from .capabilities.audio import analyze_samples
from .capabilities.mapping import openstreetmap_config
from .capabilities.ml import run_kmeans, sklearn_status
from .capabilities.optimization import nearest_neighbor_route
from .capabilities.search import search_records
from .config import scoped_path
from .db import database_readiness, fetch_sample_nodes, fetch_translation_history, get_db, insert_sample_node, insert_translation
from .llm import CourseLLMError, ask, chat, stream_ask

HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
SLUG_RE = re.compile(r"^[a-z0-9-]{3,40}$")
MAX_LABEL_LENGTH = 120
MAX_DESCRIPTION_LENGTH = 2_000
MAX_SEARCH_QUERY_LENGTH = 200
MAX_CODE_LENGTH = 30_000
MAX_CHAT_LENGTH = 2_000
MAX_CHAT_MESSAGES = 20
MAX_CHAT_MESSAGE_LENGTH = 12_000
SUPPORTED_LANGUAGES = {"Python", "JavaScript", "TypeScript", "Java", "Go", "Rust", "C++", "C#", "Ruby", "PHP", "Swift", "Kotlin", "SQL", "Bash"}


def _health_payload() -> dict[str, Any]:
    return {
        "status": "ok",
        "serverTime": datetime.now(UTC).isoformat(),
    }


def _bootstrap_payload() -> dict[str, Any]:
    return {
        "app": {
            "name": current_app.config["APP_NAME"],
            "tagline": current_app.config["APP_TAGLINE"],
            "mode": "public",
            "shell": current_app.config["APP_SHELL"],
            "shellLabel": current_app.config["APP_SHELL_LABEL"],
        },
        "health": _health_payload(),
        "availableShells": current_app.config["AVAILABLE_SHELLS"],
    }


def _api_root() -> str:
    return scoped_path(current_app.config["URL_PREFIX"], "api").rstrip("/")


def _is_json_surface() -> bool:
    api_root = _api_root()
    return (
        request.path == api_root
        or request.path.startswith(f"{api_root}/")
        or request.path.endswith("/healthz")
        or request.path.endswith("/readyz")
        or request.path in {"/healthz", "/readyz"}
    )


def _error_response(message: str, status: int):
    return jsonify({"errors": [message], "requestId": getattr(g, "request_id", None)}), status


def _json_object() -> tuple[dict[str, Any] | None, tuple[Any, int] | None]:
    if not request.is_json:
        return None, _error_response("Content-Type must be application/json", 415)
    try:
        payload = request.get_json(silent=False)
    except (BadRequest, UnsupportedMediaType):
        return None, _error_response("Request body must contain valid JSON", 400)
    if not isinstance(payload, dict):
        return None, _error_response("JSON request body must be an object", 400)
    return payload, None


def _translation_fields(payload: dict[str, Any]) -> tuple[str, str, str, tuple[Any, int] | None]:
    source_code = payload.get("sourceCode", "")
    source_language = payload.get("sourceLanguage", "")
    target_language = payload.get("targetLanguage", "")
    if not all(isinstance(value, str) for value in (source_code, source_language, target_language)):
        return "", "", "", _error_response("sourceCode, sourceLanguage, and targetLanguage must be strings", 400)
    if not source_code.strip():
        return "", "", "", _error_response("sourceCode must not be empty", 400)
    if len(source_code) > MAX_CODE_LENGTH:
        return "", "", "", _error_response(f"sourceCode must be at most {MAX_CODE_LENGTH} characters", 400)
    if source_language == target_language:
        return "", "", "", _error_response("sourceLanguage and targetLanguage must be different", 400)
    if source_language not in SUPPORTED_LANGUAGES or target_language not in SUPPORTED_LANGUAGES:
        return "", "", "", _error_response("sourceLanguage and targetLanguage must be supported languages", 400)
    return source_code, source_language, target_language, None


def _finite_number(payload: dict[str, Any], key: str, default: float) -> float:
    value = float(payload.get(key, default))
    if not math.isfinite(value):
        raise ValueError(f"{key} must be finite")
    return value


def _normalize_payload(payload: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    errors: list[str] = []
    raw_slug = payload.get("slug", "")
    raw_label = payload.get("label", "")
    raw_description = payload.get("description", "")
    raw_color = payload.get("accent_color", "#72d1c2")

    for name, value in (
        ("slug", raw_slug),
        ("label", raw_label),
        ("description", raw_description),
        ("accent_color", raw_color),
    ):
        if not isinstance(value, str):
            errors.append(f"{name} must be a string")

    cleaned = {
        "slug": raw_slug.strip() if isinstance(raw_slug, str) else "",
        "label": raw_label.strip() if isinstance(raw_label, str) else "",
        "description": raw_description.strip() if isinstance(raw_description, str) else "",
        "accent_color": raw_color.strip() if isinstance(raw_color, str) else "",
    }
    cleaned["description"] = cleaned["description"] or "Created through the sample API."

    if not SLUG_RE.fullmatch(cleaned["slug"]):
        errors.append("slug must be 3-40 characters of lowercase letters, digits, or hyphens")
    if len(cleaned["label"]) < 2 or len(cleaned["label"]) > MAX_LABEL_LENGTH:
        errors.append(f"label must be 2-{MAX_LABEL_LENGTH} characters")
    if len(cleaned["description"]) > MAX_DESCRIPTION_LENGTH:
        errors.append(f"description must be at most {MAX_DESCRIPTION_LENGTH} characters")
    if not HEX_COLOR_RE.fullmatch(cleaned["accent_color"]):
        errors.append("accent_color must be a 6-digit hex color like #72d1c2")

    try:
        cleaned["x"] = min(0.92, max(0.08, _finite_number(payload, "x", 0.5)))
        cleaned["y"] = min(0.92, max(0.08, _finite_number(payload, "y", 0.5)))
        cleaned["radius"] = min(0.2, max(0.06, _finite_number(payload, "radius", 0.11)))
    except (TypeError, ValueError, OverflowError):
        errors.append("x, y, and radius must be finite numbers")

    return cleaned, errors


def register_api_routes(app: Flask) -> None:
    prefix = app.config["URL_PREFIX"]
    enabled_features = frozenset(app.config["ENABLED_FEATURES"])

    @app.before_request
    def assign_request_id():
        g.request_id = secrets.token_hex(8)

    @app.after_request
    def harden_response(response):
        response.headers.setdefault("X-Request-ID", getattr(g, "request_id", ""))
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-origin")
        return response

    @app.errorhandler(RequestEntityTooLarge)
    def request_too_large(_: RequestEntityTooLarge):
        if _is_json_surface():
            return _error_response("Request body is too large", 413)
        return "Request body is too large", 413

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        if _is_json_surface():
            return _error_response(error.description or error.name, error.code or 500)
        return error

    @app.errorhandler(Exception)
    def unexpected_error(error: Exception):
        current_app.logger.exception("Unhandled request error")
        if _is_json_surface():
            return _error_response("The server could not complete the request", 500)
        return "The server could not complete the request", 500

    @app.get(scoped_path(prefix, "healthz"))
    def healthz():
        return jsonify(_health_payload())

    @app.get(scoped_path(prefix, "readyz"))
    def readyz():
        ready, detail = database_readiness(current_app.config)
        return jsonify({"status": "ready" if ready else "not-ready", **detail}), 200 if ready else 503

    @app.get(scoped_path(prefix, "api/bootstrap"))
    def bootstrap():
        return jsonify(_bootstrap_payload())

    @app.get(scoped_path(prefix, "api/capabilities"))
    def capabilities():
        api_base = scoped_path(prefix, "api").rstrip("/")
        return jsonify(capability_payload(api_base, enabled_features))

    if "search" in enabled_features:
        @app.get(scoped_path(prefix, "api/search"))
        def search():
            query = request.args.get("q", "")
            if len(query) > MAX_SEARCH_QUERY_LENGTH:
                return _error_response(f"q must be at most {MAX_SEARCH_QUERY_LENGTH} characters", 400)
            return jsonify(search_records(get_db(), query))

    if "mapping" in enabled_features:
        @app.get(scoped_path(prefix, "api/map/default"))
        def map_default():
            return jsonify(openstreetmap_config())

    if "machine-learning" in enabled_features:
        @app.get(scoped_path(prefix, "api/ml/status"))
        def ml_status():
            return jsonify(sklearn_status())

        @app.post(scoped_path(prefix, "api/ml/kmeans"))
        def ml_kmeans():
            payload, error = _json_object()
            if error:
                return error
            result, errors, status = run_kmeans(payload)
            if errors:
                return jsonify({"errors": errors, "requestId": g.request_id, **result}), status
            return jsonify(result)

    if "optimization" in enabled_features:
        @app.post(scoped_path(prefix, "api/optimize/route"))
        def optimize_route():
            payload, error = _json_object()
            if error:
                return error
            result, errors = nearest_neighbor_route(payload)
            if errors:
                return jsonify({"errors": errors, "requestId": g.request_id}), 400
            return jsonify(result)

    if "audio" in enabled_features:
        @app.post(scoped_path(prefix, "api/audio/analyze"))
        def audio_analyze():
            payload, error = _json_object()
            if error:
                return error
            result, errors = analyze_samples(payload)
            if errors:
                return jsonify({"errors": errors, "requestId": g.request_id}), 400
            return jsonify(result)

    @app.post(scoped_path(prefix, "api/translate"))
    def translate_code():
        payload, error = _json_object()
        if error:
            return error
        source_code, source_language, target_language, validation_error = _translation_fields(payload)
        if validation_error:
            return validation_error
        prompt = (
            "You are an expert code migration engineer. Translate the following code from "
            f"{source_language} to {target_language}. Preserve its behavior, use idiomatic "
            "target-language conventions, and include concise comments in the code explaining "
            "important differences from the source language. Return only the translated code "
            "with comments, no markdown fences.\n\nSOURCE CODE:\n" + source_code
        )
        try:
            translated = ask(prompt, max_tokens=3000)
        except CourseLLMError as exc:
            return _error_response(str(exc), 503)
        try:
            insert_translation(get_db(), {"source_language": source_language, "target_language": target_language, "source_code": source_code, "translated_code": translated})
        except sqlite3.Error:
            current_app.logger.exception("Could not save translation history")
        return jsonify({"translatedCode": translated, "model": "course AI model"})

    @app.get(scoped_path(prefix, "api/translation-history"))
    def translation_history():
        return jsonify({"history": fetch_translation_history(get_db())})

    @app.post(scoped_path(prefix, "api/translate-stream"))
    def translate_code_stream():
        payload, error = _json_object()
        if error:
            return error
        source_code, source_language, target_language, validation_error = _translation_fields(payload)
        if validation_error:
            return validation_error
        prompt = (
            "You are an expert code migration engineer. Translate the following code from "
            f"{source_language} to {target_language}. Preserve its behavior, use idiomatic "
            "target-language conventions, and include concise comments in the code explaining "
            "important differences from the source language. Return only the translated code "
            "with comments, no markdown fences.\n\nSOURCE CODE:\n" + source_code
        )

        @stream_with_context
        def events():
            translated_parts: list[str] = []
            try:
                for part in stream_ask(prompt, max_tokens=3000):
                    translated_parts.append(part)
                    yield f"data: {json.dumps({'type': 'chunk', 'text': part})}\n\n"
                translated = "".join(translated_parts)
                try:
                    insert_translation(get_db(), {"source_language": source_language, "target_language": target_language, "source_code": source_code, "translated_code": translated})
                except sqlite3.Error:
                    current_app.logger.exception("Could not save translation history")
                yield f"data: {json.dumps({'type': 'done', 'model': 'course AI model'})}\n\n"
            except CourseLLMError as exc:
                yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

        return Response(events(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post(scoped_path(prefix, "api/translation-audit"))
    def translation_audit():
        payload, error = _json_object()
        if error:
            return error
        translated_code = payload.get("translatedCode", "")
        target_language = payload.get("targetLanguage", "")
        if not isinstance(translated_code, str) or not isinstance(target_language, str) or not translated_code.strip():
            return _error_response("translatedCode and targetLanguage are required strings", 400)
        if len(translated_code) > MAX_CODE_LENGTH:
            return _error_response(f"translatedCode must be at most {MAX_CODE_LENGTH} characters", 400)
        prompt = (
            "Audit this translated code as a senior reviewer. Return ONLY valid JSON with exactly these "
            "keys: score (integer 0-100), signals (array of objects with name, value, status), and "
            "risks (array of concise strings). Identify concrete risky code paths and fault lines, "
            "including line or function references when possible. Do not invent issues; use an empty "
            "risks array when no concrete concern is visible. Target language: " + target_language +
            "\n\nTRANSLATED CODE:\n" + translated_code
        )
        try:
            raw = ask(prompt, max_tokens=1400).strip()
            match = re.search(r"\{[\s\S]*\}", raw)
            result = json.loads(match.group(0) if match else raw)
            if not isinstance(result, dict) or not isinstance(result.get("signals"), list) or not isinstance(result.get("risks"), list):
                raise ValueError("invalid audit shape")
            result["score"] = max(0, min(100, int(result.get("score", 0))))
            return jsonify({"audit": result, "model": "course AI model"})
        except (CourseLLMError, ValueError, TypeError, json.JSONDecodeError) as exc:
            if isinstance(exc, CourseLLMError):
                return _error_response(str(exc), 503)
            return _error_response("The course model returned an unreadable audit. Try the translation again.", 502)

    @app.post(scoped_path(prefix, "api/generate-tests"))
    def generate_tests():
        payload, error = _json_object()
        if error:
            return error
        translated_code = payload.get("translatedCode", "")
        target_language = payload.get("targetLanguage", "")
        if not isinstance(translated_code, str) or not isinstance(target_language, str) or not translated_code.strip():
            return _error_response("translatedCode and targetLanguage are required strings", 400)
        if len(translated_code) > MAX_CODE_LENGTH:
            return _error_response(f"translatedCode must be at most {MAX_CODE_LENGTH} characters", 400)
        prompt = (
            "Generate a compact, runnable test suite for the following translated code. Use the most "
            "idiomatic standard testing approach for the target language, cover the happy path, an "
            "edge case, and an error case. Return only test source code, with no markdown fences. "
            "Target language: " + target_language + "\n\nCODE:\n" + translated_code
        )
        try:
            tests = ask(prompt, max_tokens=2200).strip()
        except CourseLLMError as exc:
            return _error_response(str(exc), 503)
        return jsonify({"tests": tests, "model": "course AI model"})

    @app.post(scoped_path(prefix, "api/chat-suggestions"))
    def chat_suggestions():
        payload, error = _json_object()
        if error:
            return error
        source_code = payload.get("sourceCode", "")
        translated_code = payload.get("translatedCode", "")
        source_language = payload.get("sourceLanguage", "")
        target_language = payload.get("targetLanguage", "")
        if not all(isinstance(value, str) for value in (source_code, translated_code, source_language, target_language)):
            return _error_response("code and language fields must be strings", 400)
        if not source_code.strip():
            return _error_response("sourceCode must not be empty", 400)
        if len(source_code) > MAX_CODE_LENGTH or len(translated_code) > MAX_CODE_LENGTH:
            return _error_response(f"code fields must be at most {MAX_CODE_LENGTH} characters", 400)
        prompt = (
            "You are a course code-translation tutor. Based only on the code below, create exactly "
            "three useful follow-up questions a learner could ask an AI pair programmer. Ground every "
            "question in a visible function, construct, behavior, or translation decision. Prefer a mix "
            "of understanding, correctness/edge-case, and improvement questions. Return ONLY a valid JSON "
            "array of three short strings, with no markdown or extra text. Do not answer the questions.\n\n"
            f"SOURCE LANGUAGE: {source_language}\nTARGET LANGUAGE: {target_language}\n"
            f"SOURCE CODE:\n{source_code}\n\nTRANSLATED CODE:\n{translated_code}"
        )
        try:
            raw = ask(prompt, max_tokens=500).strip()
            match = re.search(r"\[[\s\S]*\]", raw)
            questions = json.loads(match.group(0) if match else raw)
            if not isinstance(questions, list):
                raise ValueError("suggestions were not an array")
            cleaned = []
            for question in questions:
                if isinstance(question, str) and 20 <= len(question.strip()) <= 180:
                    text = question.strip()
                    if text not in cleaned:
                        cleaned.append(text)
            if len(cleaned) != 3:
                raise ValueError("suggestions did not contain exactly three questions")
        except CourseLLMError as exc:
            return _error_response(str(exc), 503)
        except (ValueError, TypeError, json.JSONDecodeError):
            return _error_response("The course model returned unreadable chat suggestions. Try again.", 502)
        return jsonify({"questions": cleaned, "model": "course AI model"})

    @app.post(scoped_path(prefix, "api/chat"))
    def chat_about_code():
        payload, error = _json_object()
        if error:
            return error
        question = payload.get("question", "")
        context = payload.get("context", "")
        messages = payload.get("messages", [])
        if not isinstance(question, str) or not isinstance(context, str) or not isinstance(messages, list):
            return _error_response("question and context must be strings, and messages must be an array", 400)
        if not question.strip():
            return _error_response("question must not be empty", 400)
        if len(question) > MAX_CHAT_LENGTH:
            return _error_response(f"question must be at most {MAX_CHAT_LENGTH} characters", 400)
        if len(context) > MAX_CODE_LENGTH:
            return _error_response(f"context must be at most {MAX_CODE_LENGTH} characters", 400)
        if len(messages) > MAX_CHAT_MESSAGES:
            return _error_response(f"messages must contain at most {MAX_CHAT_MESSAGES} items", 400)
        for message in messages:
            if (
                not isinstance(message, dict)
                or message.get("role") not in {"user", "assistant"}
                or not isinstance(message.get("content"), str)
                or not message["content"].strip()
                or len(message["content"]) > MAX_CHAT_MESSAGE_LENGTH
            ):
                return _error_response("messages must contain non-empty user and assistant text", 400)
        model_messages = [
            {
                "role": "system",
                "content": (
                    "You are a helpful AI pair programmer. Answer the user's question about the generated "
                    "code clearly and concisely. Explain language differences when useful. If the user requests "
                    "a change, provide a revised code snippet and briefly explain what changed.\n\n"
                    f"GENERATED CODE:\n{context}"
                ),
            },
            *messages,
            {"role": "user", "content": question},
        ]
        try:
            answer = chat(model_messages, max_tokens=1200)
        except CourseLLMError as exc:
            return _error_response(str(exc), 503)
        return jsonify({"answer": answer, "model": "course AI model"})

    if "sample-nodes" in enabled_features:
        @app.route(scoped_path(prefix, "api/sample-nodes"), methods=["GET", "POST"])
        def sample_nodes():
            connection = get_db()
            if request.method == "GET":
                return jsonify({"sampleNodes": fetch_sample_nodes(connection)})

            payload, error = _json_object()
            if error:
                return error
            cleaned, errors = _normalize_payload(payload)
            if errors:
                return jsonify({"errors": errors, "requestId": g.request_id}), 400

            try:
                record = insert_sample_node(connection, cleaned)
            except sqlite3.IntegrityError:
                return jsonify({"errors": ["slug already exists"], "requestId": g.request_id}), 409
            except sqlite3.OperationalError:
                current_app.logger.exception("Database write remained unavailable after retries")
                return _error_response("Database is temporarily busy; retry shortly", 503)

            return jsonify({"sampleNode": record}), 201

    @app.route(
        scoped_path(prefix, "api/<path:unmatched_path>"),
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    )
    def unknown_api_route(unmatched_path: str):
        return _error_response(f"Unknown or disabled API route: {unmatched_path}", 404)
