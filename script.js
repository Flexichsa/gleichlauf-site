/* Gleichlauf: Live-Ablauf, Rechner, Mail-Vorbelegung, Takt-Anzeige. Ohne Bibliotheken, ohne Fremdabrufe. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const gross = (n) => n.toLocaleString("de-CH");
  const fmt = (n, d = 0) => n.toLocaleString("de-CH", { maximumFractionDigits: d, minimumFractionDigits: d }).replace(/[’‘]/g, "'");
  const MAIL = "felix@gleichlauf.ch";

  /* ---------- Szenen (Beispieldaten, erfunden) ---------- */
  const FAELLE = {
    offerte: {
      datei: "Anfrage Badsanierung", meta: "07:42 · per Mail",
      text: ["Guten Tag, wir möchten unser ", ["Badezimmer (6 m²)", "arbeit"], " im Haus an der ", ["Musterstrasse 12, 5000 Aarau", "objekt"], " sanieren. ", ["Dusche statt Wanne, neue Platten, Wand-WC", "wunsch"], ". Start gerne im ", ["März", "start"], ". Freundliche Grüsse, ", ["Familie Beispiel", "kunde"]],
      chips: [["kunde", "Kunde", "Familie Beispiel"], ["objekt", "Objekt", "Musterstrasse 12, Aarau"], ["arbeit", "Arbeit", "Badsanierung, 6 m²"], ["wunsch", "Wünsche", "Dusche, Platten, Wand-WC"], ["start", "Start", "März 2027"]],
      kopf: "Offerte O-2026-118, Entwurf",
      out: { typ: "tabelle", zeilen: [["Demontage und Entsorgung", "1'450.00"], ["Dusche bodeneben mit Armatur", "3'980.00"], ["Wand-WC, Unterputz-Spülkasten", "1'260.00"], ["Plattenarbeiten, 6 m²", "2'700.00"]], total: ["Total exkl. MWST", "9'390.00"], hinweis: "Preise aus Ihrer Preisliste" },
      done: "Nach Freigabe an Familie Beispiel gesendet",
    },
    rechnung: {
      datei: "rechnung_4471.pdf", meta: "07:42 · an buchhaltung@",
      text: ["", ["Muster Werkzeug AG", "lieferant"], ", Rechnung Nr. ", ["4471", "nr"], ". Werkzeug und Verbrauchsmaterial, geliefert am 18.11.2026. Total ", ["CHF 1'284.50", "betrag"], ", zahlbar bis ", ["24.12.2026", "faellig"], "."],
      chips: [["lieferant", "Lieferant", "Muster Werkzeug AG"], ["nr", "Rechnungsnr.", "4471"], ["betrag", "Betrag", "CHF 1'284.50"], ["faellig", "Fällig", "24.12.2026"], ["", "Konto (Vorschlag)", "4000 Materialaufwand"], ["", "Schon erfasst?", "Nein, geprüft"]],
      kopf: "Buchungsentwurf Kreditoren",
      out: { typ: "tabelle", zeilen: [["Soll 4000 Materialaufwand", "1'284.50"], ["Haben 2000 Kreditoren", "1'284.50"]], total: ["Zahlung vorgemerkt für", "24.12.2026"], hinweis: "Konto nach Ihrem Kontenplan vorgeschlagen" },
      done: "Nach Freigabe in die Buchhaltung übernommen",
    },
    nachfassen: {
      datei: "Montagsliste", meta: "Mo 07:00 · aus Ihrer Offertenliste",
      text: ["Ohne Antwort oder über der Frist: ", ["Offerte 097, A. Muster, 16 Tage", "o1"], " · ", ["Offerte 101, Beispiel Immobilien AG, 21 Tage", "o2"], " · ", ["Rechnung 204, Muster Bau AG, 9 Tage überfällig", "r1"]],
      chips: [["o1", "Offerte 097", "16 Tage offen"], ["o2", "Offerte 101", "21 Tage offen"], ["r1", "Rechnung 204", "9 Tage überfällig"], ["", "Entwürfe", "3 bereit"]],
      kopf: "Entwurf Nachfassen, Offerte 097",
      out: { typ: "mail", an: "A. Muster", betreff: "Unsere Offerte 097", absaetze: ["Guten Tag Herr Muster", "Vor gut zwei Wochen habe ich Ihnen die Offerte 097 gesendet. Haben Sie noch Fragen, oder soll ich etwas anpassen?"] },
      done: "Nach Freigabe gesendet",
    },
    zahlen: {
      datei: "Auftragsliste und offene Posten", meta: "Mo 07:00 · aus Ihrem System",
      text: ["Stand KW 48. Auftragsbestand ", ["CHF 412'000", "bestand"], " (+3.1 % zur Vorwoche). Umsatz der Woche ", ["CHF 58'300", "umsatz"], ". Offene Posten ", ["CHF 96'400", "op"], ", davon ", ["3 Rechnungen über 30 Tage", "alt"], "."],
      chips: [["bestand", "Auftragsbestand", "CHF 412'000"], ["umsatz", "Umsatz KW 48", "CHF 58'300"], ["op", "Offene Posten", "CHF 96'400"], ["alt", "Über 30 Tage", "3 Rechnungen"]],
      kopf: "Wochenzahlen KW 48, Entwurf",
      out: { typ: "tabelle", zeilen: [["Auftragsbestand", "412'000"], ["Umsatz der Woche", "58'300"], ["Offene Posten", "96'400"]], total: ["Davon über 30 Tage", "3 Rechnungen"], hinweis: "Beträge in CHF" },
      done: "Ab Freigabe jeden Montag um 07:00 an die Geschäftsleitung",
    },
  };
  const REIHE = ["offerte", "rechnung", "nachfassen", "zahlen"];

  /* ---------- Live-Ablauf ---------- */
  const stage = $("#stage");
  const tabs = $$('[role="tab"]');
  const ctrl = $("#stage-pause");
  const x = (n) => $(`[data-x="${n}"]`, stage);
  let current = "offerte", token = 0, userPaused = false, offscreen = false, autoplay = true, state = "idle";
  const waiters = [];
  const isPaused = () => userPaused || offscreen || document.hidden;

  function sleep(ms, tk) {
    return new Promise((res) => {
      let left = ms, last = performance.now();
      const loop = () => {
        if (tk !== token) return res(false);
        if (isPaused()) { waiters.push(() => { last = performance.now(); loop(); }); return; }
        const now = performance.now(); left -= now - last; last = now;
        if (left <= 0) return res(true);
        setTimeout(loop, Math.min(left, 80));
      };
      loop();
    });
  }
  const wake = () => { if (!isPaused()) waiters.splice(0).forEach((f) => f()); };

  function renderText(parts) {
    return parts.map((p) => (Array.isArray(p) ? `<mark data-k="${esc(p[1])}">${esc(p[0])}</mark>` : esc(p))).join("");
  }
  function renderOut(o) {
    if (o.typ === "mail") {
      return `<div class="out-mail"><p class="om-line"><span>An</span> ${esc(o.an)}</p><p class="om-line"><span>Betreff</span> ${esc(o.betreff)}</p>` +
        o.absaetze.map((a, i) => `<p class="om-p" style="--i:${i}">${esc(a)}</p>`).join("") + `</div>`;
    }
    const rows = o.zeilen.map((z, i) => `<tr style="--i:${i}"><td>${esc(z[0])}</td><td class="num">${esc(z[1])}</td></tr>`).join("");
    return `<table class="out-table"><tbody>${rows}<tr class="tot" style="--i:${o.zeilen.length}"><td>${esc(o.total[0])}</td><td class="num">${esc(o.total[1])}</td></tr></tbody></table><p class="out-hint">${esc(o.hinweis)}</p>`;
  }
  function render(id) {
    const f = FAELLE[id];
    stage.classList.remove("st-in", "st-read", "st-out", "st-press", "st-done", "st-instant");
    x("datei").textContent = f.datei; x("meta").textContent = f.meta;
    x("text").innerHTML = renderText(f.text);
    x("chips").innerHTML = f.chips.map((c) => `<li data-k="${esc(c[0])}"><span class="c-l">${esc(c[1])}</span><span class="c-v">${esc(c[2])}</span></li>`).join("");
    x("kopf").textContent = f.kopf;
    x("out").innerHTML = renderOut(f.out);
    x("done").textContent = f.done;
  }
  function setTab(id) {
    tabs.forEach((t) => { const on = t.dataset.fall === id; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; });
    stage.setAttribute("aria-labelledby", "tab-" + id);
  }
  function setCtrl(s) {
    state = s;
    const txt = $(".ctrl-txt", ctrl);
    ctrl.dataset.state = s === "running" && userPaused ? "paused" : s;
    if (s === "running") { txt.textContent = userPaused ? "Weiter" : "Pause"; ctrl.setAttribute("aria-pressed", String(userPaused)); }
    else { txt.textContent = "Nochmal abspielen"; ctrl.setAttribute("aria-pressed", "false"); }
  }
  function showEnd() {
    stage.classList.add("st-instant", "st-in", "st-read", "st-out", "st-press", "st-done");
    $$("mark, .chips li", stage).forEach((e) => e.classList.add("on"));
  }

  async function play(id, force) {
    const tk = ++token;
    current = id; setTab(id); render(id);
    if (reduce.matches && !force) { showEnd(); setCtrl("idle"); return; }
    setCtrl("running");
    stage.classList.add("st-in");
    if (!(await sleep(550, tk))) return;
    stage.classList.add("st-read");
    const chips = $$(".chips li", stage);
    for (const c of chips) {
      if (!(await sleep(640, tk))) return;
      c.classList.add("on");
      const m = c.dataset.k && $(`mark[data-k="${c.dataset.k}"]`, stage);
      if (m) m.classList.add("on");
    }
    if (!(await sleep(650, tk))) return;
    stage.classList.add("st-out");
    if (!(await sleep(1700, tk))) return;
    stage.classList.add("st-press");
    if (!(await sleep(850, tk))) return;
    stage.classList.add("st-done");
    if (autoplay && !reduce.matches) {
      if (!(await sleep(4300, tk))) return;
      play(REIHE[(REIHE.indexOf(id) + 1) % REIHE.length]);
    } else setCtrl("idle");
  }

  tabs.forEach((t) => {
    t.addEventListener("click", () => { autoplay = false; play(t.dataset.fall, true); });
    t.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(t); let n = null;
      if (e.key === "ArrowRight") n = (i + 1) % tabs.length; else if (e.key === "ArrowLeft") n = (i + tabs.length - 1) % tabs.length;
      else if (e.key === "Home") n = 0; else if (e.key === "End") n = tabs.length - 1;
      if (n !== null) { e.preventDefault(); tabs[n].focus(); tabs[n].click(); }
    });
  });
  ctrl.addEventListener("click", () => {
    if (state === "running") { userPaused = !userPaused; setCtrl("running"); wake(); }
    else { autoplay = false; userPaused = false; play(current, true); }
  });
  $$("[data-zeige]").forEach((b) => b.addEventListener("click", () => {
    autoplay = false; userPaused = false;
    play(b.dataset.zeige, true);
    $("#ablauf-live").scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
  }));
  document.addEventListener("visibilitychange", wake);
  let gesehen = false;
  const sichtbar = new IntersectionObserver((es) => {
    offscreen = !es[0].isIntersecting;
    if (!offscreen && !gesehen) { gesehen = true; play("offerte"); }   // Start erst, wenn der Ablauf wirklich im Bild ist
    wake();
  }, { threshold: 0.25 });
  sichtbar.observe($("#ablauf-live"));
  reduce.addEventListener?.("change", () => { if (reduce.matches) { autoplay = false; token++; render(current); showEnd(); setCtrl("idle"); } });
  setTab("offerte"); render("offerte");
  if (reduce.matches) { gesehen = true; play("offerte"); }   // reduzierte Bewegung: sofort der fertige Zustand

  /* ---------- Rechner ---------- */
  const PRESETS = {
    offerte: { m: 25, min: 20, p: 25, name: "Offerten" },
    rechnung: { m: 60, min: 4, p: 25, name: "Eingangsrechnungen" },
    nachfassen: { m: 40, min: 12, p: 25, name: "Nachfassen" },
    zahlen: { m: 4, min: 120, p: 5, name: "Berichte" },
  };
  const R = { m: $("#r-menge"), min: $("#r-min"), p: $("#r-pruef"), s: $("#r-satz") };
  const O = { m: $("#o-menge"), min: $("#o-min"), p: $("#o-pruef"), s: $("#o-satz") };
  const out = { std: $("#c-std"), chf: $("#c-chf"), regel: $("#c-regel"), mail: $("#c-mail") };
  let calcFall = "offerte", shown = { std: 0, chf: 0 };

  function tween(el, key, to) {
    if (reduce.matches) { el.textContent = gross(to); shown[key] = to; return; }
    const from = shown[key], t0 = performance.now(), dur = 380;
    cancelAnimationFrame(tween[key]);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = gross(Math.round(from + (to - from) * e));
      if (k < 1) tween[key] = requestAnimationFrame(step); else shown[key] = to;
    };
    tween[key] = requestAnimationFrame(step);
  }
  function rechne() {
    const m = +R.m.value, min = +R.min.value, p = +R.p.value, s = +R.s.value;
    O.m.textContent = m; O.min.textContent = min; O.p.textContent = p + " %"; O.s.textContent = s;
    const stdMonat = (m * min) / 60;
    const frei = stdMonat * (1 - p / 100) * 12;
    const std = Math.round(frei), chf = Math.round((frei * s) / 10) * 10;
    tween(out.std, "std", std); tween(out.chf, "chf", chf);
    out.regel.textContent = `${m} Vorgänge × ${min} Minuten = ${fmt(stdMonat, 1)} Stunden im Monat. Mit Automatik bleiben ${p} % davon fürs Prüfen.`;
    const body = `Guten Tag Herr Biernath\n\nMeine Rechnung zum Thema ${PRESETS[calcFall].name}: ${m} Vorgänge pro Monat à ${min} Minuten, ${p} % Prüfzeit, interner Ansatz CHF ${s}. Ergebnis: rund ${fmt(std)} Stunden pro Jahr, Gegenwert ca. CHF ${fmt(chf)}.\n\nDas würde ich gerne besprechen.\n`;
    out.mail.href = `mailto:${MAIL}?subject=${encodeURIComponent("Rechnung zur Automatisierung: " + PRESETS[calcFall].name)}&body=${encodeURIComponent(body)}`;
  }
  Object.values(R).forEach((i) => i.addEventListener("input", rechne));
  $$("[data-calc]").forEach((b) => b.addEventListener("click", () => {
    calcFall = b.dataset.calc; const p = PRESETS[calcFall];
    $$("[data-calc]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    R.m.value = p.m; R.min.value = p.min; R.p.value = p.p; rechne();
  }));
  shown = { std: 75, chf: 6000 }; rechne();

  /* ---------- Abschluss: Mail mit Thema ---------- */
  const close = $("#close-mail");
  $$("[data-thema]").forEach((b) => b.addEventListener("click", () => {
    $$("[data-thema]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    const t = b.dataset.thema;
    close.href = `mailto:${MAIL}?subject=${encodeURIComponent("Gespräch zur Automatisierung: " + t)}&body=${encodeURIComponent("Guten Tag Herr Biernath\n\nBei uns frisst am meisten Zeit: " + t + "\n\n")}`;
  }));
  $$("[data-thema]").forEach((b) => b.setAttribute("aria-pressed", "false"));

  /* ---------- Ausprobieren: Text einfügen, Angaben werden herausgelesen (nur im Browser) ---------- */
  const SAMPLES = {
    anfrage: "Guten Tag\n\nwir möchten unser Badezimmer (6 m²) in der Musterstrasse 12, 5000 Aarau sanieren. Dusche statt Wanne, neue Platten. Start gerne im März, eine Offerte bis 15.12.2026 wäre toll. Sie erreichen mich unter 079 123 45 67 oder familie.beispiel@muster.ch.\n\nFreundliche Grüsse\nFamilie Beispiel",
    rechnung: "Muster Werkzeug AG, Rechnung Nr. 4471 vom 18.11.2026\n\nWerkzeug und Verbrauchsmaterial, 12 Stück Akkuschrauber-Sets. Total CHF 1'284.50 inkl. MWST. Zahlbar innert 30 Tagen bis 24.12.2026 auf CH93 0076 2011 6238 5295 7.\n\nRückfragen: buchhaltung@muster-werkzeug.ch",
    mahnung: "Erinnerung: Die Rechnung R-2026-204 über CHF 3'450.00 war am 12.11.2026 fällig. Bitte überweisen Sie den Betrag innert 10 Tagen. Dringend: Die Offerte 097 vom 03.11.2026 wartet noch auf Ihre Antwort."
  };
  const TYPEN = [
    ["IBAN", "t-iban", /\bCH\d{2}(?:\s?\d{4}){4}\s?\d\b/g],
    ["E-Mail", "t-kontakt", /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
    ["Telefon", "t-kontakt", /(?:\+41|0041|0)\s?\(?\d{2}\)?[\s.]?\d{3}[\s.]?\d{2}[\s.]?\d{2}(?!\d)/g],
    ["Betrag", "t-betrag", /(?:CHF|Fr\.|SFr\.?|EUR|€)\s?\d{1,3}(?:['’]\d{3})*(?:[.,]\d{1,2})?(?:\.-)?|\b\d{1,3}(?:['’]\d{3})*[.,]\d{2}\s?(?:CHF|Franken|Fr\.)/g],
    ["Datum", "t-datum", /\b\d{1,2}\.\d{1,2}\.(?:\d{4}|\d{2})\b|\b\d{1,2}\.\s?(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)(?:\s\d{4})?/g],
    ["Nummer", "t-nummer", /\b(?:Rechnung|Offerte|Auftrag|Bestellung|Referenz|Lieferschein)(?:s?-?(?:nummer|nr\.?))?\s*(?:Nr\.?\s*)?[:#]?\s*[A-Z]{0,2}-?\d[\d\-\/]{2,}\b|\b[A-Z]{1,2}-\d{4}-\d{2,}\b/gi],
    ["PLZ, Ort", "t-ort", /\b[1-9]\d{3}\s+[A-ZÄÖÜ][\wäöüéèà.\-]+(?:\s[A-ZÄÖÜ][\wäöüéèà.\-]+)?/g],
    ["Menge", "t-menge", /\b\d+(?:[.,]\d+)?\s?(?:m²|m2|qm|Stück|Stk\.?|kg|Std\.?|Stunden)(?![\wäöü])/gi],
    ["Frist", "t-frist", /\b(?:dringend|sofort|innert \d+ Tagen|innerhalb von \d+ Tagen|bis (?:Ende|spätestens) [^.,;\n]{3,24})/gi]
  ];
  const tryText = $("#try-text"), tryMarked = $("#try-marked"), tryFound = $("#try-found"), tryHead = $("#try-head"), tryMail = $("#try-mail");
  function lies(text) {
    const treffer = [];
    TYPEN.forEach(([label, klasse, re]) => {
      re.lastIndex = 0; let m;
      while ((m = re.exec(text))) { if (!m[0].trim()) { re.lastIndex++; continue; } treffer.push({ s: m.index, e: m.index + m[0].length, label, klasse, t: m[0] }); }
    });
    treffer.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    const frei = []; let ende = -1;
    treffer.forEach((t) => { if (t.s >= ende) { frei.push(t); ende = t.e; } });
    return frei;
  }
  function zeigeLesen() {
    const text = tryText.value, t = lies(text);
    if (!text.trim()) { tryMarked.innerHTML = '<span class="empty">Fügen Sie links einen Text ein oder wählen Sie ein Beispiel.</span>'; tryFound.innerHTML = ""; tryHead.textContent = "Gelesen"; return; }
    let html = "", pos = 0;
    t.forEach((x) => { html += esc(text.slice(pos, x.s)) + `<mark class="${x.klasse}" title="${esc(x.label)}">${esc(x.t)}</mark>`; pos = x.e; });
    html += esc(text.slice(pos));
    tryMarked.innerHTML = html;
    const gruppen = {}; t.forEach((x) => { gruppen[x.label] = (gruppen[x.label] || 0) + 1; });
    tryFound.innerHTML = t.slice(0, 18).map((x) => `<li class="${x.klasse}"><span class="f-k">${esc(x.label)}</span><span class="f-v">${esc(x.t.trim())}</span></li>`).join("");
    tryHead.textContent = t.length ? `Gelesen: ${t.length} ${t.length === 1 ? "Angabe" : "Angaben"}` : "Gelesen: nichts Erkennbares";
    const kurz = Object.entries(gruppen).map(([k, n]) => `${n}× ${k}`).join(", ") || "noch nichts";
    tryMail.href = `mailto:${MAIL}?subject=${encodeURIComponent("Gespräch zur Automatisierung: Texte lesen")}&body=${encodeURIComponent("Guten Tag Herr Biernath\n\nIch habe auf Ihrer Seite einen Text ausprobiert (gelesen wurden: " + kurz + ").\nSo etwas würde ich gerne für unsere Texte besprechen.\n")}`;
  }
  tryText.addEventListener("input", () => { $$("[data-sample]").forEach((b) => b.setAttribute("aria-pressed", "false")); zeigeLesen(); });
  $$("[data-sample]").forEach((b) => b.addEventListener("click", () => {
    tryText.value = SAMPLES[b.dataset.sample];
    $$("[data-sample]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    zeigeLesen();
  }));
  $$("[data-sample]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  tryText.value = SAMPLES.anfrage; $('[data-sample="anfrage"]').setAttribute("aria-pressed", "true"); zeigeLesen();

  /* ---------- Baukasten ---------- */
  const BAU = {
    trig: { pdf: ["Mail mit PDF", "Wenn eine Mail mit PDF eintrifft,"], form: ["Anfrage übers Formular", "Wenn eine Anfrage über Ihr Formular kommt,"], excel: ["Neue Excel-Zeile", "Wenn in Ihrer Excel-Liste eine Zeile dazukommt,"], montag: ["Montag, 7 Uhr", "Jeden Montag um 7 Uhr"] },
    akt: { lesen: ["Angaben lesen", "liest der Ablauf die Angaben heraus"], entwurf: ["Entwurf erstellen", "erstellt der Ablauf einen fertigen Entwurf"], liste: ["Liste bilden", "bildet der Ablauf eine Liste mit allem Offenen"], zahlen: ["Zahlen zusammenfassen", "fasst der Ablauf die Zahlen zusammen"] },
    ziel: { postfach: ["Entwurf im Postfach", "und legt das Ergebnis als Entwurf in Ihrem Postfach ab"], buchhaltung: ["Ihre Buchhaltung", "und übergibt das Ergebnis Ihrer Buchhaltung zur Übernahme"], excel: ["Ihre Excel-Liste", "und trägt das Ergebnis in Ihre Excel-Liste ein"], team: ["Mail an Ihr Team", "und schickt das Ergebnis per Mail an Ihr Team"] }
  };
  const wahl = { trig: "pdf", akt: "lesen", ziel: "postfach" };
  const bauMail = $("#build-mail"), bauSatz = $("#build-sentence");
  function baue(animiert) {
    ["trig", "akt", "ziel"].forEach((g) => { $("#n-" + g).textContent = BAU[g][wahl[g]][0]; });
    const satz = `${BAU.trig[wahl.trig][1]} ${BAU.akt[wahl.akt][1]} ${BAU.ziel[wahl.ziel][1]}. Danach gibt Ihr Team frei.`;
    bauSatz.textContent = satz;
    bauMail.href = `mailto:${MAIL}?subject=${encodeURIComponent("Ablauf besprechen")}&body=${encodeURIComponent("Guten Tag Herr Biernath\n\nIch habe auf Ihrer Seite einen Ablauf zusammengestellt:\n" + satz + "\n\nDas würde ich gerne mit Ihnen besprechen.\n")}`;
    if (animiert && !reduce.matches) $$(".flow .node").forEach((n, i) => { n.classList.remove("pulse"); setTimeout(() => n.classList.add("pulse"), 90 * i); setTimeout(() => n.classList.remove("pulse"), 90 * i + 520); });
  }
  $$("[data-g]").forEach((b) => b.addEventListener("click", () => {
    wahl[b.dataset.g] = b.dataset.v;
    $$(`[data-g="${b.dataset.g}"]`).forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
    baue(true);
  }));
  baue(false);

  /* ---------- Adresse kopieren ---------- */
  const kopie = $("#copy-mail"), kopieMsg = $("#copy-msg");
  if (kopie) kopie.addEventListener("click", async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(MAIL); ok = true; } catch (e) {
      const t = document.createElement("textarea"); t.value = MAIL; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select();
      try { ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      document.body.removeChild(t);
    }
    kopieMsg.textContent = ok ? "Kopiert" : "Bitte von Hand kopieren";
    setTimeout(() => { kopieMsg.textContent = ""; }, 2600);
  });

  /* ---------- Einblenden beim Scrollen und Lesefortschritt (nur ohne «Bewegung reduzieren») ---------- */
  if (!reduce.matches && "IntersectionObserver" in window) {
    const ziele = $$(".case, .steps li, .plain li, .sec h2, .sec .sec-lead, .calc-out, .close-chips, .two > div, .try-in, .try-out, .build-groups, .flow, .build-sentence, .faq details");
    ziele.forEach((e, i) => { e.classList.add("reveal"); e.style.setProperty("--d", (i % 4) * 70 + "ms"); });
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    ziele.forEach((e) => io.observe(e));

    const bar = $(".takt-progress");
    let ticking = false;
    const upd = () => {
      ticking = false;
      const h = document.documentElement.scrollHeight - innerHeight;
      bar.style.setProperty("--p", (h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0).toFixed(4));
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    addEventListener("resize", upd); upd();
  }
})();
