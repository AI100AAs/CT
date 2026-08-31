const EXAMPLES = {
  Python: {
    etl: 'from csv import DictReader\n\ndef normalize_users(path):\n    with open(path, newline="") as stream:\n        return [{"name": row["name"].strip(), "active": row["status"] == "active"} for row in DictReader(stream)]',
    retry: 'import time\n\ndef fetch_with_retry(request, attempts=3):\n    for attempt in range(attempts):\n        try:\n            return request()\n        except TimeoutError:\n            if attempt == attempts - 1: raise\n            time.sleep(2 ** attempt)',
    group: 'from collections import defaultdict\n\ndef totals_by_customer(transactions):\n    totals = defaultdict(float)\n    for transaction in transactions:\n        totals[transaction["customer_id"]] += transaction["amount"]\n    return dict(totals)',
  },
  JavaScript: { etl: 'function normalizeUsers(rows) {\n  return rows.filter(row => row.status === "active").map(row => ({ name: row.name.trim(), active: true }));\n}', retry: 'async function fetchWithRetry(request, attempts = 3) {\n  for (let attempt = 0; attempt < attempts; attempt += 1) {\n    try { return await request(); } catch (error) {\n      if (attempt === attempts - 1) throw error;\n      await new Promise(resolve => setTimeout(resolve, 2 ** attempt * 1000));\n    }\n  }\n}', group: 'function totalsByCustomer(transactions) {\n  return transactions.reduce((totals, item) => {\n    totals[item.customerId] = (totals[item.customerId] || 0) + item.amount;\n    return totals;\n  }, {});\n}' },
  TypeScript: { etl: 'type User = { name: string; active: boolean };\n\nfunction normalizeUsers(rows: Record<string, string>[]): User[] {\n  return rows.map(row => ({ name: row.name.trim(), active: row.status === "active" }));\n}', retry: 'async function fetchWithRetry<T>(request: () => Promise<T>, attempts = 3): Promise<T> {\n  for (let attempt = 0; attempt < attempts; attempt++) {\n    try { return await request(); } catch (error) { if (attempt === attempts - 1) throw error; }\n  }\n  throw new Error("unreachable");\n}', group: 'function totalsByCustomer(items: { customerId: string; amount: number }[]): Record<string, number> {\n  return items.reduce((out, item) => ({ ...out, [item.customerId]: (out[item.customerId] || 0) + item.amount }), {});\n}' },
  'C++': { etl: '#include <string>\n#include <vector>\n\nstruct User { std::string name; bool active; };\nstd::vector<User> normalize_users(const std::vector<std::pair<std::string, std::string>>& rows) {\n  std::vector<User> users;\n  for (const auto& row : rows) users.push_back({row.first, row.second == "active"});\n  return users;\n}', retry: '#include <chrono>\n#include <thread>\n\ntemplate <typename Request>\nauto fetch_with_retry(Request request, int attempts = 3) {\n  for (int attempt = 0; attempt < attempts; ++attempt) {\n    try { return request(); } catch (...) {\n      if (attempt == attempts - 1) throw;\n      std::this_thread::sleep_for(std::chrono::seconds(1 << attempt));\n    }\n  }\n}', group: '#include <unordered_map>\n\nstd::unordered_map<std::string, double> totals_by_customer(const std::vector<Transaction>& items) {\n  std::unordered_map<std::string, double> totals;\n  for (const auto& item : items) totals[item.customer_id] += item.amount;\n  return totals;\n}' },
  Java: { etl: 'List<User> normalizeUsers(List<Row> rows) {\n  return rows.stream().map(row -> new User(row.name().trim(), row.status().equals("active"))).toList();\n}', retry: 'for (int attempt = 0; attempt < 3; attempt++) {\n  try { return request.call(); } catch (TimeoutException error) {\n    if (attempt == 2) throw error;\n  }\n}', group: 'Map<String, Double> totals = new HashMap<>();\nfor (Transaction item : items) totals.merge(item.customerId(), item.amount(), Double::sum);' },
};
const GENERIC_EXAMPLES = { Go: 'func normalizeUsers(rows []Row) []User {\n  users := make([]User, 0, len(rows))\n  for _, row := range rows { users = append(users, User{Name: strings.TrimSpace(row.Name), Active: row.Status == "active"}) }\n  return users\n}', Rust: 'fn normalize_users(rows: Vec<Row>) -> Vec<User> {\n    rows.into_iter().map(|row| User { name: row.name.trim().to_string(), active: row.status == "active" }).collect()\n}', 'C#': 'IReadOnlyList<User> NormalizeUsers(IEnumerable<Row> rows) => rows.Select(row => new User(row.Name.Trim(), row.Status == "active")).ToList();', Ruby: 'def normalize_users(rows)\n  rows.select { |row| row[:status] == "active" }.map { |row| { name: row[:name].strip, active: true } }\nend', PHP: 'function normalizeUsers(array $rows): array {\n    return array_map(fn($row) => ["name" => trim($row["name"]), "active" => $row["status"] === "active"], $rows);\n}', Swift: 'func normalizeUsers(_ rows: [Row]) -> [User] {\n    rows.map { User(name: $0.name.trimmingCharacters(in: .whitespaces), active: $0.status == "active") }\n}', Kotlin: 'fun normalizeUsers(rows: List<Row>): List<User> = rows.map { User(it.name.trim(), it.status == "active") }', SQL: 'SELECT TRIM(name) AS name, status = \'active\' AS active\nFROM users\nWHERE status IS NOT NULL;', Bash: 'normalize_users() {\n  awk -F, \'NR > 1 { print $1 "," ($2 == "active") }\' "$1"\n; }' };
const EXTRA_EXAMPLES = {
  Python: { cache: 'from functools import lru_cache\n\n@lru_cache(maxsize=128)\ndef lookup_user(user_id):\n    if user_id <= 0:\n        raise ValueError("user_id must be positive")\n    return fetch_user(user_id)', validate: 'def validate_order(order):\n    required = {"id", "items", "currency"}\n    missing = required - order.keys()\n    if missing:\n        raise ValueError(f"Missing fields: {sorted(missing)}")\n    return order["items"] and order["currency"] in {"USD", "CAD"}' },
  JavaScript: { cache: 'const cache = new Map();\n\nasync function getUser(id) {\n  if (cache.has(id)) return cache.get(id);\n  const user = await fetchUser(id);\n  cache.set(id, user);\n  return user;\n}', validate: 'function validateOrder(order) {\n  const required = ["id", "items", "currency"];\n  const missing = required.filter(key => !(key in order));\n  if (missing.length) throw new Error(`Missing fields: ${missing.join(", ")}`);\n  return order.items.length > 0 && ["USD", "CAD"].includes(order.currency);\n}' },
  TypeScript: { cache: 'const cache = new Map<number, User>();\n\nasync function getUser(id: number): Promise<User> {\n  if (cache.has(id)) return cache.get(id)!;\n  const user = await fetchUser(id);\n  cache.set(id, user);\n  return user;\n}', validate: 'function validateOrder(order: Partial<Order>): order is Order {\n  if (!order.id || !order.items?.length) return false;\n  return order.currency === "USD" || order.currency === "CAD";\n}' },
  'C++': { cache: 'std::unordered_map<int, User> cache;\n\nUser get_user(int id) {\n  if (id <= 0) throw std::invalid_argument("id");\n  if (auto it = cache.find(id); it != cache.end()) return it->second;\n  return cache[id] = fetch_user(id);\n}', validate: 'bool valid_order(const Order& order) {\n  return order.id > 0 && !order.items.empty() &&\n         (order.currency == "USD" || order.currency == "CAD");\n}' },
};

const FILE_LANGUAGES = {
  py: "Python", js: "JavaScript", ts: "TypeScript", java: "Java", go: "Go", rs: "Rust", cpp: "C++", cc: "C++", c: "C++", cs: "C#", rb: "Ruby", php: "PHP", swift: "Swift", kt: "Kotlin", kts: "Kotlin", sql: "SQL", sh: "Bash",
};
const MAX_UPLOAD_LENGTH = 30000;

function bootstrap() {
  const runtime = window.GizmoAppRuntime;
  if (!runtime) throw new Error("The shared app runtime did not load.");
  const config = runtime.readConfig();
  const source = document.getElementById("source-code");
  const target = document.getElementById("target-code");
  const sourceLanguage = document.getElementById("source-language");
  const targetLanguage = document.getElementById("target-language");
  const status = document.getElementById("translation-status");
  const chatLog = document.getElementById("chat-log");
  const translateButton = document.getElementById("translate-button");
  const progress = document.getElementById("translation-progress");
  const progressFill = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");
  const historyList = document.getElementById("history-list");
  const historyCount = document.getElementById("history-count");
  const fileInput = document.getElementById("file-input");
  const fileNote = document.getElementById("file-note");
  const suggestedQuestions = document.getElementById("suggested-questions");
  const themeButton = document.getElementById("theme-button");
  const qualityScore = document.getElementById("quality-score");
  const qualitySignals = document.getElementById("quality-signals");
  const riskList = document.getElementById("risk-list");
  const auditLabel = document.getElementById("audit-label");
  const testsButton = document.getElementById("tests-button");
  const testsStatus = document.getElementById("tests-status");
  const testOutput = document.getElementById("test-output");
  const pulseSource = document.getElementById("pulse-source");
  const pulseTarget = document.getElementById("pulse-target");
  const pulseLines = document.getElementById("pulse-lines");
  const pulseTokens = document.getElementById("pulse-tokens");
  const pulseComplexity = document.getElementById("pulse-complexity");
  let suggestionTimer;
  let suggestionRequestId = 0;
  let chatHistory = [];

  function setStatus(message) { status.lastChild.textContent = ` ${message}`; }

  function setProgress(percent, label) {
    progress.hidden = false;
    progressFill.style.width = `${percent}%`;
    progressLabel.textContent = label;
  }

  function finishProgress() { progressFill.style.width = "100%"; progressLabel.textContent = "AI RESPONSE RECEIVED"; }

  function updatePulse() {
    const code = source.value;
    const lines = code ? code.split("\n").length : 0;
    const words = code.trim() ? code.trim().split(/\s+/).length : 0;
    const branches = (code.match(/\b(if|else|for|while|catch|switch|case|try)\b|&&|\|\|/g) || []).length;
    pulseSource.textContent = sourceLanguage.value.toUpperCase();
    pulseTarget.textContent = targetLanguage.value.toUpperCase();
    pulseLines.textContent = String(lines).padStart(2, "0");
    pulseTokens.textContent = words.toLocaleString();
    pulseComplexity.textContent = branches > 5 ? "HIGH" : branches > 1 ? "MID" : "LOW";
  }

  function escapeHtml(value) { return value.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split(String.fromCharCode(34)).join("&quot;").split(String.fromCharCode(39)).join("&#39;"); }
  function renderMarkdown(value) {
    const blocks = [];
    let safe = escapeHtml(value).replace(/```(\w+)?\n([\s\S]*?)```/g, (_, language, code) => {
      const highlighted = code.trim().replace(/\b(const|let|var|function|return|if|else|for|while|class|def|import|from|try|catch|throw|fn|func|struct|SELECT|FROM|WHERE|async|await|new|true|false|null|None)\b/g, '<span class="syntax-keyword">$1</span>');
      return `@@CODE_${blocks.push(`<pre class="chat-code"><code>${highlighted}</code></pre>`) - 1}@@`;
    });
    safe = safe.replace(/^### (.+)$/gm, '<h4>$1</h4>').replace(/^## (.+)$/gm, '<h3>$1</h3>').replace(/^# (.+)$/gm, '<h2>$1</h2>');
    safe = safe.replace(/^[-*] (.+)$/gm, '<li>$1</li>').replace(/(<li>[\s\S]*?<\/li>)(?:<br>|$)/g, '<ul>$1</ul>');
    safe = safe.replace(/\x60([^\x60]+)\x60/g, '<code class="inline-code">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    return safe.replace(/@@CODE_(\d+)@@/g, (_, index) => blocks[Number(index)]);
  }
  function renderAudit(audit) {
    const risks = audit.risks.length ? audit.risks : ["No concrete fault lines found by the AI reviewer. Check boundary cases and runtime dependencies."];
    qualityScore.innerHTML = `<strong>${audit.score}</strong><span>SCORE / 100</span>`;
    qualitySignals.replaceChildren(...audit.signals.map((signal) => { const item = document.createElement("div"); item.className = "quality-signal"; item.innerHTML = `<span>${escapeHtml(signal.name || "SIGNAL")}</span><b class="signal-${signal.status === "PASS" ? "green" : "orange"}">${escapeHtml(String(signal.value || signal.status || "REVIEW"))}</b>`; return item; }));
    riskList.innerHTML = "<h3>FAULT LINES TO REVIEW / AI</h3>" + risks.map((risk) => "<p><i>!</i>" + escapeHtml(String(risk)) + "</p>").join("");
    auditLabel.textContent = `${audit.risks.length} AI ATTENTION FLAGS`;
  }
  async function auditTranslation() {
    const code = outputText(); if (!code || code.startsWith("// translated code")) return;
    auditLabel.textContent = "AI REVIEWING...";
    try {
      const response = await fetch(`${config.apiBase}/translation-audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ translatedCode: code, targetLanguage: targetLanguage.value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.errors?.[0] || "AI audit failed.");
      renderAudit(data.audit); setStatus("AI TRANSLATION COMPLETE. Audit findings are model-generated; review the fault lines below.");
    } catch (error) { auditLabel.textContent = "AI AUDIT UNAVAILABLE"; riskList.innerHTML = `<p class="empty-history">${escapeHtml(error.message)}</p>`; }
  }

  function renderSuggestions(questions) {
    const hasSource = source.value.trim().length > 0;
    const fallbackQuestions = hasSource ? [
      `Why is this ${targetLanguage.value} approach idiomatic?`,
      "Suggest a safer or more performant version",
      "What edge cases should I test?",
    ] : ["What makes a good code translation?", "How do I verify behavior is preserved?"];
    const visibleQuestions = questions || fallbackQuestions;
    suggestedQuestions.replaceChildren(...visibleQuestions.map((question) => {
      const button = document.createElement("button"); button.type = "button"; button.textContent = question;
      button.addEventListener("click", () => { document.getElementById("chat-input").value = question; document.getElementById("chat-input").focus(); });
      return button;
    }));
  }

  function refreshSuggestions() {
    const requestId = ++suggestionRequestId;
    clearTimeout(suggestionTimer);
    renderSuggestions();
    if (source.value.trim().length < 20) return;
    suggestionTimer = window.setTimeout(async () => {
      try {
        const response = await fetch(`${config.apiBase}/chat-suggestions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceCode: source.value.slice(0, 14500),
            translatedCode: outputText().slice(0, 14500),
            sourceLanguage: sourceLanguage.value,
            targetLanguage: targetLanguage.value,
          }),
        });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.questions)) throw new Error("suggestions unavailable");
        if (requestId === suggestionRequestId) renderSuggestions(data.questions);
      } catch (error) {
        // The fallback questions remain useful when the course model is busy.
        if (requestId === suggestionRequestId) renderSuggestions();
      }
    }, 700);
  }

  async function translate() {
    const code = source.value.trim();
    if (!code) { target.textContent = "// add source code to begin"; setStatus("SOURCE EMPTY. Waiting for code."); return; }
    translateButton.disabled = true;
    setProgress(12, "READING SOURCE CODE");
    setStatus(`ASKING COURSE AI TO TRANSLATE ${sourceLanguage.value} → ${targetLanguage.value}...`);
    try {
      setProgress(28, "BUILDING MIGRATION PROMPT");
      const response = await fetch(`${config.apiBase}/translate-stream`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceCode: code, sourceLanguage: sourceLanguage.value, targetLanguage: targetLanguage.value }),
      });
      if (!response.ok) { const data = await response.json(); throw new Error(data.errors?.[0] || "The AI translation failed."); }
      setProgress(45, "AI IS WRITING THE TRANSLATION LIVE");
      target.textContent = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const events = buffer.split("\n\n"); buffer = events.pop() || "";
        for (const event of events) {
          const line = event.split("\n").find((entry) => entry.startsWith("data: "));
          if (!line) continue;
          const message = JSON.parse(line.slice(6));
          if (message.type === "chunk") { target.textContent += message.text; target.scrollTop = target.scrollHeight; }
           if (message.type === "done") { completed = true; finishProgress(); await auditTranslation(); refreshSuggestions(); setStatus(`AI TRANSLATION COMPLETE via ${message.model}. Review the AI audit findings.`); }
          if (message.type === "error") throw new Error(message.message);
        }
        if (done) break;
      }
      if (!completed) throw new Error("The AI stream ended before the translation was complete.");
      await loadHistory();
    } catch (error) {
      progress.hidden = true;
      target.textContent = "// AI translation unavailable\n// Check the status message and try again.";
      setStatus(`AI ERROR. ${error.message}`);
    } finally {
      translateButton.disabled = false;
    }
  }

  function addMessage(kind, label, message) {
    const item = document.createElement("div"); item.className = `chat-message ${kind}`;
     item.innerHTML = `<span class="message-label"></span><div class="message-bubble"></div>`;
     item.querySelector(".message-label").textContent = label; item.querySelector(".message-bubble").innerHTML = kind === "assistant" ? renderMarkdown(message) : escapeHtml(message);
    chatLog.append(item); chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderHistory(items) {
    historyCount.textContent = `${items.length} SAVED`;
    historyList.replaceChildren();
    if (!items.length) { historyList.innerHTML = '<p class="empty-history">Completed translations will appear here.</p>'; return; }
    items.forEach((item) => {
      const button = document.createElement("button"); button.className = "history-item"; button.type = "button";
      const date = new Date(item.created_at.replace(" ", "T") + "Z");
      button.innerHTML = '<span class="history-route"></span><span class="history-date"></span><span class="history-preview"></span>';
      button.querySelector(".history-route").textContent = `${item.source_language} → ${item.target_language}`;
      button.querySelector(".history-date").textContent = Number.isNaN(date.getTime()) ? item.created_at : date.toLocaleString();
      button.querySelector(".history-preview").textContent = item.source_code.split("\n")[0];
       button.addEventListener("click", () => {
         source.value = item.source_code; sourceLanguage.value = item.source_language; targetLanguage.value = item.target_language;
         target.textContent = item.translated_code; chatHistory = []; chatLog.replaceChildren(); addMessage("assistant", "AI / 00:00", "Translation restored. Ask me about this code to start a new conversation."); auditTranslation(); setStatus("HISTORY RESTORED. Run translation again to refresh it.");
       });
      historyList.append(button);
    });
  }

  function outputText() { return target.textContent.trim(); }

  function chatContext() {
    const sourceContext = source.value.slice(0, 14500);
    const targetContext = target.textContent.slice(0, 14500);
    return `SOURCE (${sourceLanguage.value}):\n${sourceContext}\n\nTRANSLATION (${targetLanguage.value}):\n${targetContext}`;
  }

  function downloadOutput() {
    const text = outputText();
    if (!text || text.startsWith("// translated code")) { setStatus("NOTHING TO DOWNLOAD. Run a translation first."); return; }
    const extension = { "C++": "cpp", Rust: "rs", Go: "go", Java: "java", TypeScript: "ts" }[targetLanguage.value] || "txt";
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); link.download = `translated-${targetLanguage.value.toLowerCase()}.${extension}`; link.click(); URL.revokeObjectURL(link.href);
    setStatus("DOWNLOAD READY. Your translated code is saved locally.");
  }

  async function generateTests() {
    const code = outputText();
    if (!code || code.startsWith("// translated code")) { setStatus("NO TRANSLATION. Run a translation before generating tests."); return; }
    testsButton.disabled = true; testsStatus.textContent = "AI IS WRITING TARGET-LANGUAGE TESTS...";
    try {
      const response = await fetch(`${config.apiBase}/generate-tests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ translatedCode: code, targetLanguage: targetLanguage.value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.errors?.[0] || "Test generation failed.");
      testOutput.hidden = false; testOutput.textContent = data.tests; testsStatus.textContent = `TESTS GENERATED via ${data.model}.`; setStatus("AI TEST SUITE READY. Review the happy path, edge case, and error case.");
    } catch (error) { testsStatus.textContent = `TEST GENERATION ERROR. ${error.message}`; setStatus(testsStatus.textContent); }
    finally { testsButton.disabled = false; }
  }

  async function loadHistory() {
    try { const response = await fetch(`${config.apiBase}/translation-history`); const data = await response.json(); if (response.ok) renderHistory(data.history); }
    catch (error) { console.debug("Translation history is unavailable.", error); }
  }

  document.getElementById("translate-button").addEventListener("click", translate);
   document.getElementById("example-button").addEventListener("click", () => { const key = document.getElementById("example-select").value; source.value = EXAMPLES[sourceLanguage.value]?.[key] || EXTRA_EXAMPLES[sourceLanguage.value]?.[key] || (key === "etl" ? GENERIC_EXAMPLES[sourceLanguage.value] : `${GENERIC_EXAMPLES[sourceLanguage.value]}\n\n// ${key} example: add the domain-specific boundary here.`); fileNote.textContent = `Built-in ${sourceLanguage.value} example loaded`; setStatus("EXAMPLE LOADED. Ready to translate."); refreshSuggestions(); updatePulse(); });
  document.getElementById("upload-button").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_LENGTH * 4) {
      fileInput.value = "";
      setStatus(`FILE TOO LARGE. Keep uploads under ${MAX_UPLOAD_LENGTH.toLocaleString()} characters.`);
      return;
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    const inferredLanguage = FILE_LANGUAGES[extension];
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const code = String(reader.result || "");
      if (!code.trim()) {
        setStatus("FILE EMPTY. Choose a file containing source code.");
      } else if (code.length > MAX_UPLOAD_LENGTH) {
        setStatus(`FILE TOO LARGE. Keep uploads under ${MAX_UPLOAD_LENGTH.toLocaleString()} characters.`);
      } else {
        source.value = code;
        fileNote.textContent = `${file.name} loaded locally${inferredLanguage ? ` · detected ${inferredLanguage}` : ""}`;
        if (inferredLanguage && [...sourceLanguage.options].some((option) => option.value === inferredLanguage)) sourceLanguage.value = inferredLanguage;
         setStatus("FILE LOADED. Review the source, then run translation."); updatePulse();
      }
      fileInput.value = "";
    });
    reader.addEventListener("error", () => { fileInput.value = ""; setStatus("FILE ERROR. The browser could not read that file."); });
    reader.readAsText(file);
  });
  document.getElementById("copy-button").addEventListener("click", async (event) => {
    try { await navigator.clipboard?.writeText(target.textContent || ""); } catch (error) { console.debug("Clipboard access is unavailable in this preview.", error); }
    event.currentTarget.textContent = "COPIED"; window.setTimeout(() => { event.currentTarget.textContent = "COPY"; }, 1200);
  });
  document.getElementById("download-button").addEventListener("click", downloadOutput);
  testsButton.addEventListener("click", generateTests);
  themeButton.addEventListener("click", () => { const light = document.documentElement.classList.toggle("light-mode"); themeButton.textContent = light ? "DARK MODE" : "LIGHT MODE"; themeButton.setAttribute("aria-pressed", String(light)); });
     document.getElementById("clear-button").addEventListener("click", () => { source.value = ""; fileNote.textContent = "Paste code or upload a local text file. Files stay in your browser until translation."; target.textContent = "// translated code will appear here\n// your explanation will be included as comments"; testOutput.hidden = true; testOutput.textContent = ""; testsStatus.textContent = "Generate target-language tests after translating."; progress.hidden = true; chatHistory = []; setStatus("READY. Waiting for source code."); chatLog.replaceChildren(); addMessage("assistant", "AI / 00:00", "Paste your code and run a translation. I’ll explain the moves, not just change the syntax."); refreshSuggestions(); updatePulse(); });
  document.getElementById("chat-form").addEventListener("submit", (event) => {
     event.preventDefault(); const input = document.getElementById("chat-input"); const question = input.value.trim(); if (!question) return;
      const previousMessages = chatHistory.slice(-20); addMessage("user", "YOU / NOW", question); addMessage("assistant", "AI / THINKING", "Analyzing the generated code...");
       fetch(`${config.apiBase}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, context: chatContext(), messages: previousMessages }) }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.errors?.[0] || "The AI chat failed."); chatLog.lastElementChild.querySelector(".message-bubble").innerHTML = renderMarkdown(data.answer); chatLog.lastElementChild.querySelector(".message-label").textContent = "AI / NOW"; chatHistory = [...previousMessages, { role: "user", content: question }, { role: "assistant", content: data.answer }].slice(-20); }).catch((error) => { chatLog.lastElementChild.querySelector(".message-bubble").textContent = `AI ERROR. ${error.message}`; });
     input.value = "";
   });
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") translate(); });
     sourceLanguage.addEventListener("change", () => { [...targetLanguage.options].forEach((option) => { option.hidden = option.value === sourceLanguage.value; }); if (targetLanguage.value === sourceLanguage.value) targetLanguage.value = [...targetLanguage.options].find((option) => !option.hidden)?.value || ""; refreshSuggestions(); updatePulse(); });
    sourceLanguage.dispatchEvent(new Event("change"));
    source.addEventListener("input", () => { refreshSuggestions(); updatePulse(); }); targetLanguage.addEventListener("change", () => { refreshSuggestions(); updatePulse(); }); refreshSuggestions(); updatePulse();
  loadHistory();
  runtime.markReady();
}

try { bootstrap(); } catch (error) { window.GizmoAppRuntime?.showFatalError(error); }
