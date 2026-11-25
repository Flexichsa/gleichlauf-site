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

  /* ---------- Einblenden beim Scrollen und Takt-Anzeige (nur ohne «Bewegung reduzieren») ---------- */
  if (!reduce.matches && "IntersectionObserver" in window) {
    const ziele = $$(".case, .steps li, .plain li, .sec h2, .sec .sec-lead, .calc-out, .close-chips, .two > div");
    ziele.forEach((e, i) => { e.classList.add("reveal"); e.style.setProperty("--d", (i % 4) * 70 + "ms"); });
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    ziele.forEach((e) => io.observe(e));

    const bar = $(".takt-progress");
    let ticking = false;
    const upd = () => {
      ticking = false;
      const h = document.documentElement.scrollHeight - innerHeight;
      const p = h > 0 ? Math.min(1, Math.max(0, scrollY / h)) : 0;
      bar.style.setProperty("--p", p.toFixed(4));
      bar.style.setProperty("--gap", (14 + (1 - p) * 46).toFixed(1) + "px");
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(upd); } }, { passive: true });
    addEventListener("resize", upd); upd();
  }
})();
