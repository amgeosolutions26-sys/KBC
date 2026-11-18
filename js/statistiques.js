// KBC Admin – page Statistiques
// Données réelles : tables commandes, commande_articles, produits, stocks (Supabase)
// Mode démonstration : données fictives générées dans le navigateur, clairement signalées.

const adminName = document.getElementById("admin-name");
const statsMessage = document.getElementById("stats-message");

const STATUTS = {
  en_attente:     { nom: "En attente",     couleur: "#f2b01e" },
  confirmee:      { nom: "Confirmée",      couleur: "#2d6cdf" },
  en_preparation: { nom: "En préparation", couleur: "#8b5cf6" },
  expediee:       { nom: "Expédiée",       couleur: "#0ea5a4" },
  livree:         { nom: "Livrée",         couleur: "#198754" },
  annulee:        { nom: "Annulée",        couleur: "#dc3545" }
};

const MODES_PAIEMENT = {
  wave: "Wave",
  orange_money: "Orange Money",
  livraison: "Paiement à la livraison"
};

const PERIODES = {
  "7":    { jours: 7,   pas: "jour",    texte: "les 7 derniers jours" },
  "30":   { jours: 30,  pas: "jour",    texte: "les 30 derniers jours" },
  "90":   { jours: 90,  pas: "semaine", texte: "les 3 derniers mois" },
  "365":  { jours: 365, pas: "mois",    texte: "les 12 derniers mois" },
  "tout": { jours: null, pas: "mois",   texte: "toute la période" }
};

const etat = {
  periode: "30",
  demo: false,
  reel: { commandes: [], stocks: [] },
  demoData: null,
  courant: null
};

/* ---------- Outils ---------- */

const NS = "http://www.w3.org/2000/svg";

function el(tag, classe, texte) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

function svg(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
  return n;
}

function fcfa(n) {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
}

function nombre(n) {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR");
}

function compact(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " M";
  if (n >= 1e3) return Math.round(n / 1e3) + " k";
  return String(Math.round(n));
}

function pourcent(part, total) {
  return total > 0 ? (part / total) * 100 : 0;
}

function formaterPourcent(v) {
  return v.toFixed(v >= 10 || v === 0 ? 0 : 1).replace(".", ",") + " %";
}

function debutJour(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function debutSemaine(d) {
  const x = debutJour(d);
  const jour = (x.getDay() + 6) % 7; // lundi = 0
  x.setDate(x.getDate() - jour);
  return x;
}

function debutMois(d) {
  const x = debutJour(d);
  x.setDate(1);
  return x;
}

function debutBucket(d, pas) {
  return pas === "jour" ? debutJour(d) : pas === "semaine" ? debutSemaine(d) : debutMois(d);
}

function suivant(d, pas) {
  const x = new Date(d);
  if (pas === "jour") x.setDate(x.getDate() + 1);
  else if (pas === "semaine") x.setDate(x.getDate() + 7);
  else x.setMonth(x.getMonth() + 1);
  return x;
}

function libelleBucket(d, pas) {
  if (pas === "mois") {
    return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }).replace(".", "");
  }
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "");
}

function chiffresTel(t) {
  return String(t || "").replace(/\D/g, "").slice(-9);
}

/* ---------- Authentification (même règle que le tableau de bord) ---------- */

async function verifierAdministrateur() {
  const { data: sessionData, error: sessionError } = await db.auth.getSession();

  if (sessionError || !sessionData.session) {
    window.location.replace("connexion.html");
    return false;
  }

  const user = sessionData.session.user;
  const { data: profile, error } = await db
    .from("profiles")
    .select("nom, role")
    .eq("id", user.id)
    .single();

  if (error || !profile || !["admin", "gestionnaire"].includes(profile.role)) {
    await db.auth.signOut();
    window.location.replace("connexion.html");
    return false;
  }

  adminName.textContent = profile.nom || user.email;
  return true;
}

/* ---------- Chargement des données réelles ---------- */

async function chargerReel() {
  const [cmd, prod, stk] = await Promise.all([
    db.from("commandes")
      .select("id, numero_commande, statut, mode_paiement, montant_total, created_at, ville, telephone, commande_articles(nom_produit, quantite, sous_total, produit_id)")
      .order("created_at", { ascending: false })
      .limit(5000),
    db.from("produits").select("id, categories(nom)"),
    db.from("stocks").select("quantite, seuil_alerte, produits(nom)")
  ]);

  if (cmd.error) throw cmd.error;

  const categories = new Map();
  (prod.data || []).forEach(p => {
    const c = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    categories.set(p.id, c?.nom || "Autres");
  });

  etat.reel.commandes = (cmd.data || []).map(c => ({
    id: c.id,
    numero: c.numero_commande || "",
    statut: c.statut,
    paiement: c.mode_paiement,
    montant: Number(c.montant_total) || 0,
    date: new Date(c.created_at),
    ville: (c.ville || "").trim(),
    tel: chiffresTel(c.telephone),
    articles: (c.commande_articles || []).map(a => ({
      nom: a.nom_produit || "Produit",
      qte: Number(a.quantite) || 0,
      total: Number(a.sous_total) || 0,
      categorie: categories.get(a.produit_id) || "Autres"
    }))
  }));

  etat.reel.stocks = stk.error ? [] : (stk.data || []).map(s => ({
    nom: (Array.isArray(s.produits) ? s.produits[0] : s.produits)?.nom || "Produit",
    quantite: Number(s.quantite) || 0,
    seuil: Number(s.seuil_alerte) || 0
  }));
}

/* ---------- Données de démonstration ---------- */

function genererDemo(seed = 62) {
  let graine = seed;
  const rnd = () => {               // générateur déterministe (mulberry32)
    graine |= 0; graine = (graine + 0x6D2B79F5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const choisir = (liste) => {
    const total = liste.reduce((s, x) => s + x.poids, 0);
    let r = rnd() * total;
    for (const x of liste) { r -= x.poids; if (r <= 0) return x; }
    return liste[liste.length - 1];
  };

  const catalogue = [
    { nom: "iPhone 17",       prix: 725000, categorie: "High-tech",   poids: 0.25 },
    { nom: "Casque sans fil", prix: 45000,  categorie: "High-tech",   poids: 3 },
    { nom: "Écouteurs",       prix: 18000,  categorie: "High-tech",   poids: 4 },
    { nom: "Maillot Sénégal", prix: 15000,  categorie: "Maillots",    poids: 7 },
    { nom: "Maillot Lions",   prix: 15000,  categorie: "Maillots",    poids: 6 },
    { nom: "T-shirt",         prix: 5000,   categorie: "Mode",        poids: 8 },
    { nom: "Chemise",         prix: 12000,  categorie: "Mode",        poids: 6 },
    { nom: "Pantalon",        prix: 14000,  categorie: "Mode",        poids: 5 },
    { nom: "Montre quartz",   prix: 18500,  categorie: "Montres",     poids: 4 },
    { nom: "Parfum Sauvage",  prix: 65000,  categorie: "Accessoires", poids: 3 },
    { nom: "Baskets",         prix: 32000,  categorie: "Chaussures",  poids: 4 },
    { nom: "Mocassins",       prix: 24000,  categorie: "Chaussures",  poids: 3 }
  ];
  const villes = [
    { nom: "Dakar", poids: 35 }, { nom: "Thiès", poids: 20 }, { nom: "Rufisque", poids: 15 },
    { nom: "Mbour", poids: 12 }, { nom: "Saint-Louis", poids: 10 }, { nom: "Touba", poids: 8 }
  ];
  const paiements = [
    { id: "wave", poids: 45 }, { id: "orange_money", poids: 30 }, { id: "livraison", poids: 25 }
  ];
  const anciens = [
    { id: "livree", poids: 84 }, { id: "annulee", poids: 12 }, { id: "expediee", poids: 4 }
  ];
  const recents = [
    { id: "en_attente", poids: 25 }, { id: "confirmee", poids: 20 }, { id: "en_preparation", poids: 15 },
    { id: "expediee", poids: 15 }, { id: "livree", poids: 15 }, { id: "annulee", poids: 10 }
  ];
  const clients = Array.from({ length: 140 }, (_, i) => String(770000000 + i * 7919 % 9999999).slice(0, 9));

  const commandes = [];
  let n = 0;
  for (let j = 729; j >= 0; j--) {
    const date = new Date();
    date.setDate(date.getDate() - j);
    const croissance = 1.5 + 1.2 * (1 - j / 730);
    const weekend = [5, 6].includes(date.getDay()) ? 1.25 : 1;
    let lambda = croissance * weekend;
    let nb = 0;
    for (let p = Math.exp(-lambda), s = p, u = rnd(); u > s && nb < 12; nb++) { p *= lambda / (nb + 1); s += p; }

    for (let k = 0; k < nb; k++) {
      const d = new Date(date);
      d.setHours(8 + Math.floor(rnd() * 13), Math.floor(rnd() * 60));
      if (d > new Date()) continue;

      const articles = [];
      const nbArticles = rnd() < 0.62 ? 1 : rnd() < 0.75 ? 2 : 3;
      for (let a = 0; a < nbArticles; a++) {
        const p = choisir(catalogue);
        const qte = rnd() < 0.8 ? 1 : 2;
        articles.push({ nom: p.nom, qte, total: p.prix * qte, categorie: p.categorie });
      }
      n += 1;
      commandes.push({
        id: "demo-" + n,
        numero: "KBC-DEMO-" + String(n).padStart(4, "0"),
        statut: choisir(j > 10 ? anciens : recents).id,
        paiement: choisir(paiements).id,
        montant: articles.reduce((s, x) => s + x.total, 0),
        date: d,
        ville: choisir(villes).nom,
        tel: clients[Math.floor(rnd() * clients.length)],
        articles
      });
    }
  }

  const stocks = [
    { nom: "iPhone 17", quantite: 0, seuil: 3 },
    { nom: "Maillot Sénégal", quantite: 2, seuil: 5 },
    { nom: "Écouteurs", quantite: 3, seuil: 6 },
    { nom: "Montre quartz", quantite: 4, seuil: 5 },
    { nom: "Chemise", quantite: 0, seuil: 4 },
    { nom: "T-shirt", quantite: 48, seuil: 10 }
  ];
  return { commandes, stocks };
}

/* ---------- Calculs ---------- */

function calculer(commandes, cle) {
  const cfg = PERIODES[cle];
  const maintenant = new Date();
  let debut, precedent = null;

  if (cfg.jours) {
    debut = debutJour(maintenant);
    debut.setDate(debut.getDate() - (cfg.jours - 1));
    const debutPrec = new Date(debut);
    debutPrec.setDate(debutPrec.getDate() - cfg.jours);
    precedent = commandes.filter(c => c.date >= debutPrec && c.date < debut);
  } else {
    const plusAncienne = commandes.reduce((m, c) => (c.date < m ? c.date : m), maintenant);
    debut = debutMois(plusAncienne);
  }

  const periode = commandes.filter(c => c.date >= debut && c.date <= maintenant);
  const resume = (liste) => {
    const valides = liste.filter(c => c.statut !== "annulee");
    const ca = valides.reduce((s, c) => s + c.montant, 0);
    return {
      total: liste.length,
      annulees: liste.length - valides.length,
      valides,
      ca,
      panier: valides.length ? ca / valides.length : 0,
      articles: valides.reduce((s, c) => s + c.articles.reduce((x, a) => x + a.qte, 0), 0),
      clients: new Set(valides.map(c => c.tel).filter(Boolean)).size
    };
  };

  const courant = resume(periode);
  const prec = precedent ? resume(precedent) : null;

  // Série temporelle
  const pas = cfg.pas;
  const buckets = [];
  const index = new Map();
  for (let d = debutBucket(debut, pas); d <= maintenant; d = suivant(d, pas)) {
    const b = { debut: new Date(d), ca: 0, commandes: 0 };
    buckets.push(b);
    index.set(d.getTime(), b);
  }
  courant.valides.forEach(c => {
    const b = index.get(debutBucket(c.date, pas).getTime());
    if (b) { b.ca += c.montant; b.commandes += 1; }
  });

  // Regroupements
  const cumul = (map, cle, valeur) => map.set(cle, (map.get(cle) || 0) + valeur);
  const parProduit = new Map(), parProduitCA = new Map(), parCategorie = new Map(),
        parPaiement = new Map(), parVille = new Map(), parStatut = new Map();

  periode.forEach(c => {
    cumul(parStatut, c.statut, 1);
  });
  courant.valides.forEach(c => {
    cumul(parPaiement, c.paiement || "autre", 1);
    cumul(parVille, c.ville || "Non renseignée", 1);
    c.articles.forEach(a => {
      cumul(parProduit, a.nom, a.qte);
      cumul(parProduitCA, a.nom, a.total);
      cumul(parCategorie, a.categorie, a.total);
    });
  });

  return { debut, pas, buckets, courant, prec, parProduit, parProduitCA, parCategorie, parPaiement, parVille, parStatut, periode };
}

function trier(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/* ---------- Affichage : indicateurs ---------- */

function afficherDelta(id, actuel, precedent) {
  const n = document.getElementById(id);
  n.className = "st-delta";
  if (precedent === null || precedent === undefined) { n.textContent = ""; return; }
  if (precedent === 0) { n.textContent = actuel > 0 ? "Nouveau" : "—"; if (actuel > 0) n.classList.add("up"); return; }
  const v = ((actuel - precedent) / precedent) * 100;
  const signe = v > 0 ? "▲ +" : v < 0 ? "▼ " : "= ";
  n.textContent = signe + Math.abs(v).toFixed(Math.abs(v) >= 10 ? 0 : 1).replace(".", ",") + " % vs période précédente";
  n.classList.add(v > 0 ? "up" : v < 0 ? "down" : "flat");
}

function afficherKpis(s) {
  const c = s.courant;
  document.getElementById("kpi-ca").textContent = fcfa(c.ca);
  document.getElementById("kpi-commandes").textContent = nombre(c.total);
  document.getElementById("kpi-panier").textContent = fcfa(c.panier);
  document.getElementById("kpi-articles").textContent = nombre(c.articles);
  document.getElementById("kpi-clients").textContent = nombre(c.clients);
  document.getElementById("kpi-annul").textContent = formaterPourcent(pourcent(c.annulees, c.total));

  afficherDelta("delta-ca", c.ca, s.prec ? s.prec.ca : null);
  afficherDelta("delta-commandes", c.total, s.prec ? s.prec.total : null);
  afficherDelta("delta-panier", c.panier, s.prec ? s.prec.panier : null);

  document.getElementById("sub-articles").textContent = "sur les commandes non annulées";
  document.getElementById("sub-clients").textContent = "numéros de téléphone distincts";
  document.getElementById("sub-annul").textContent = c.annulees + " commande" + (c.annulees > 1 ? "s" : "") + " annulée" + (c.annulees > 1 ? "s" : "");
}

function afficherPointsCles(s) {
  const zone = document.getElementById("highlights");
  zone.replaceChildren();
  const c = s.courant;

  const produit = trier(s.parProduit, 1)[0];
  const ville = trier(s.parVille, 1)[0];
  const paiement = trier(s.parPaiement, 1)[0];
  const meilleur = s.buckets.reduce((m, b) => (b.ca > m.ca ? b : m), { ca: 0 });

  const puces = [];
  if (produit) puces.push(["Produit star", produit[0], produit[1] + " vendu" + (produit[1] > 1 ? "s" : "")]);
  if (ville) puces.push(["Ville n°1", ville[0], formaterPourcent(pourcent(ville[1], c.valides.length)) + " des commandes"]);
  if (paiement) puces.push(["Paiement préféré", MODES_PAIEMENT[paiement[0]] || paiement[0], formaterPourcent(pourcent(paiement[1], c.valides.length)) + " des commandes"]);
  if (meilleur.ca > 0) puces.push([s.pas === "jour" ? "Meilleur jour" : s.pas === "semaine" ? "Meilleure semaine" : "Meilleur mois", libelleBucket(meilleur.debut, s.pas), fcfa(meilleur.ca)]);

  puces.forEach(([titre, valeur, detail]) => {
    const p = el("div", "st-chip");
    p.append(el("span", "st-chip-title", titre), el("strong", "", valeur), el("small", "", detail));
    zone.appendChild(p);
  });
}

/* ---------- Affichage : graphique des ventes ---------- */

function pasNice(v) {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

function afficherGraphique(s) {
  const zone = document.getElementById("chart-ca");
  zone.replaceChildren();

  const nomPas = s.pas === "jour" ? "par jour" : s.pas === "semaine" ? "par semaine" : "par mois";
  document.getElementById("chart-note").textContent = "Ventes " + nomPas + " (hors annulées)";

  const L = 800, H = 290, g = 54, d = 14, b = 34, r = 8;
  const max = Math.max(...s.buckets.map(x => x.ca), 0);
  const pas = pasNice((max || 1) / 4);
  const top = Math.max(pas * Math.ceil((max || 1) / pas), pas);

  const racine = svg("svg", { viewBox: `0 0 ${L} ${H}`, role: "img", class: "st-svg",
    "aria-label": "Graphique du chiffre d'affaires " + nomPas });

  const defs = svg("defs");
  const grad = svg("linearGradient", { id: "gradBarre", x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.append(svg("stop", { offset: "0", "stop-color": "#ff9a2e" }), svg("stop", { offset: "1", "stop-color": "#ff6a00" }));
  defs.appendChild(grad);
  racine.appendChild(defs);

  const hauteur = H - d - b;
  const y = v => d + hauteur - (v / top) * hauteur;

  for (let v = 0; v <= top + 0.001; v += pas) {
    racine.appendChild(svg("line", { x1: g, x2: L - r, y1: y(v), y2: y(v), class: "st-grid-line" }));
    const t = svg("text", { x: g - 8, y: y(v) + 4, "text-anchor": "end", class: "st-axis" });
    t.textContent = compact(v);
    racine.appendChild(t);
  }

  const n = s.buckets.length;
  const largeur = (L - g - r) / n;
  const barre = Math.max(2, Math.min(34, largeur * 0.68));
  const moyenne = n ? s.buckets.reduce((x, k) => x + k.ca, 0) / n : 0;

  s.buckets.forEach((bk, i) => {
    const x = g + i * largeur + (largeur - barre) / 2;
    const h = Math.max(bk.ca > 0 ? 2 : 0, (bk.ca / top) * hauteur);
    const rect = svg("rect", { x, y: d + hauteur - h, width: barre, height: h, rx: Math.min(4, barre / 2), fill: "url(#gradBarre)", class: "st-bar" });
    const titre = svg("title");
    titre.textContent = `${libelleBucket(bk.debut, s.pas)} : ${fcfa(bk.ca)} (${bk.commandes} commande${bk.commandes > 1 ? "s" : ""})`;
    rect.appendChild(titre);
    racine.appendChild(rect);
  });

  // Étiquettes de l'axe horizontal (au plus ~8)
  const saut = Math.max(1, Math.ceil(n / 8));
  s.buckets.forEach((bk, i) => {
    if (i % saut !== 0) return;
    const t = svg("text", { x: g + i * largeur + largeur / 2, y: H - 12, "text-anchor": "middle", class: "st-axis" });
    t.textContent = libelleBucket(bk.debut, s.pas);
    racine.appendChild(t);
  });

  if (moyenne > 0) {
    racine.appendChild(svg("line", { x1: g, x2: L - r, y1: y(moyenne), y2: y(moyenne), class: "st-avg-line" }));
    const t = svg("text", { x: L - r, y: y(moyenne) - 6, "text-anchor": "end", class: "st-avg-text" });
    t.textContent = "Moyenne " + compact(moyenne);
    racine.appendChild(t);
  }

  zone.appendChild(racine);
}

/* ---------- Affichage : anneau des statuts ---------- */

function afficherStatuts(s) {
  const zone = document.getElementById("chart-statuts");
  zone.replaceChildren();

  const total = s.periode.length;
  const R = 62, C = 2 * Math.PI * R;
  const racine = svg("svg", { viewBox: "0 0 180 180", class: "st-donut", role: "img", "aria-label": "Répartition des commandes par statut" });
  racine.appendChild(svg("circle", { cx: 90, cy: 90, r: R, fill: "none", stroke: "#eee", "stroke-width": 24 }));

  let decalage = 0;
  Object.entries(STATUTS).forEach(([cle, info]) => {
    const v = s.parStatut.get(cle) || 0;
    if (!v) return;
    const longueur = (v / total) * C;
    const arc = svg("circle", {
      cx: 90, cy: 90, r: R, fill: "none", stroke: info.couleur, "stroke-width": 24,
      "stroke-dasharray": `${Math.max(longueur - 1.5, 0.5)} ${C - Math.max(longueur - 1.5, 0.5)}`,
      "stroke-dashoffset": -decalage, transform: "rotate(-90 90 90)"
    });
    const t = svg("title");
    t.textContent = `${info.nom} : ${v}`;
    arc.appendChild(t);
    racine.appendChild(arc);
    decalage += longueur;
  });

  const centre = svg("text", { x: 90, y: 92, "text-anchor": "middle", class: "st-donut-total" });
  centre.textContent = nombre(total);
  const sous = svg("text", { x: 90, y: 112, "text-anchor": "middle", class: "st-donut-sub" });
  sous.textContent = total > 1 ? "commandes" : "commande";
  racine.append(centre, sous);

  const legende = el("ul", "st-legend");
  Object.entries(STATUTS).forEach(([cle, info]) => {
    const v = s.parStatut.get(cle) || 0;
    if (!v) return;
    const li = el("li");
    const pastille = el("span", "st-dot");
    pastille.style.background = info.couleur;
    li.append(pastille, el("span", "st-legend-name", info.nom),
      el("strong", "", String(v)), el("small", "", formaterPourcent(pourcent(v, total))));
    legende.appendChild(li);
  });

  zone.append(racine, legende);
}

/* ---------- Affichage : barres horizontales ---------- */

function afficherBarres(id, entrees, formatValeur, formatDetail, vide) {
  const zone = document.getElementById(id);
  zone.replaceChildren();

  if (!entrees.length) {
    zone.appendChild(el("p", "st-vide", vide || "Aucune donnée sur cette période."));
    return;
  }

  const max = Math.max(...entrees.map(e => e.valeur), 1);
  entrees.forEach(e => {
    const ligne = el("div", "st-bar-row");
    const tete = el("div", "st-bar-head");
    tete.append(el("span", "st-bar-label", e.nom), el("strong", "", formatValeur(e)));
    const piste = el("div", "st-track");
    const rempli = el("div", "st-fill");
    rempli.style.width = Math.max(3, (e.valeur / max) * 100) + "%";
    piste.appendChild(rempli);
    ligne.append(tete, piste);
    if (formatDetail) ligne.appendChild(el("small", "st-bar-detail", formatDetail(e)));
    zone.appendChild(ligne);
  });
}

function afficherRepartitions(s) {
  const c = s.courant;
  const totalCA = c.ca;

  afficherBarres("top-produits",
    trier(s.parProduit, 6).map(([nom, qte]) => ({ nom, valeur: qte, ca: s.parProduitCA.get(nom) || 0 })),
    e => e.valeur + " vendu" + (e.valeur > 1 ? "s" : ""),
    e => fcfa(e.ca) + " de ventes");

  afficherBarres("top-categories",
    trier(s.parCategorie, 6).map(([nom, ca]) => ({ nom, valeur: ca })),
    e => formaterPourcent(pourcent(e.valeur, totalCA)),
    e => fcfa(e.valeur));

  afficherBarres("top-paiements",
    trier(s.parPaiement, 4).map(([id, n]) => ({ nom: MODES_PAIEMENT[id] || id, valeur: n })),
    e => formaterPourcent(pourcent(e.valeur, c.valides.length)),
    e => e.valeur + " commande" + (e.valeur > 1 ? "s" : ""));

  afficherBarres("top-villes",
    trier(s.parVille, 5).map(([nom, n]) => ({ nom, valeur: n })),
    e => formaterPourcent(pourcent(e.valeur, c.valides.length)),
    e => e.valeur + " commande" + (e.valeur > 1 ? "s" : ""));
}

function afficherStocks(stocks) {
  const liste = document.getElementById("stock-alertes");
  liste.replaceChildren();

  const alertes = stocks
    .filter(s => s.quantite <= s.seuil)
    .sort((a, b) => a.quantite - b.quantite)
    .slice(0, 6);

  if (!alertes.length) {
    liste.appendChild(el("li", "st-vide", "Aucune alerte : tous les stocks sont suffisants."));
    return;
  }

  alertes.forEach(s => {
    const li = el("li");
    const rupture = s.quantite === 0;
    li.append(el("span", "", s.nom));
    const badge = el("span", "stock-badge " + (rupture ? "badge-danger" : "badge-warning"),
      rupture ? "Rupture" : s.quantite + " restant" + (s.quantite > 1 ? "s" : ""));
    li.appendChild(badge);
    liste.appendChild(li);
  });
}

/* ---------- Orchestration ---------- */

function donneesActives() {
  if (etat.demo) {
    if (!etat.demoData) etat.demoData = genererDemo();
    return etat.demoData;
  }
  return etat.reel;
}

function rafraichir() {
  const donnees = donneesActives();
  const s = calculer(donnees.commandes, etat.periode);
  etat.courant = s;

  const vide = s.periode.length === 0;
  document.getElementById("stats-body").hidden = vide;
  document.getElementById("empty-state").hidden = !vide;
  document.getElementById("demo-banner").hidden = !etat.demo;
  document.getElementById("print-subtitle").textContent =
    "Statistiques sur " + PERIODES[etat.periode].texte + " – édité le " + new Date().toLocaleDateString("fr-FR") +
    (etat.demo ? " (données de démonstration)" : "");

  afficherStocks(donnees.stocks);
  if (vide) return;

  afficherKpis(s);
  afficherPointsCles(s);
  afficherGraphique(s);
  afficherStatuts(s);
  afficherRepartitions(s);
}

/* ---------- Export CSV ---------- */

function celluleCSV(valeur) {
  let t = String(valeur ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;   // évite l'exécution de formules dans Excel
  return '"' + t.replace(/"/g, '""') + '"';
}

function exporterCSV() {
  if (!etat.courant) return;
  const lignes = [["Numéro", "Date", "Ville", "Statut", "Paiement", "Montant (FCFA)"]];
  etat.courant.periode
    .slice()
    .sort((a, b) => a.date - b.date)
    .forEach(c => lignes.push([
      c.numero, c.date.toLocaleString("fr-FR"), c.ville,
      STATUTS[c.statut]?.nom || c.statut, MODES_PAIEMENT[c.paiement] || c.paiement, Math.round(c.montant)
    ]));

  const csv = "\ufeff" + lignes.map(l => l.map(celluleCSV).join(";")).join("\r\n");
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  lien.download = `kbc-commandes-${etat.periode}${etat.demo ? "-demo" : ""}.csv`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

/* ---------- Événements ---------- */

document.querySelectorAll(".st-periods button").forEach(bouton => {
  bouton.addEventListener("click", () => {
    etat.periode = bouton.dataset.periode;
    document.querySelectorAll(".st-periods button").forEach(b =>
      b.setAttribute("aria-pressed", String(b === bouton)));
    rafraichir();
  });
});

document.getElementById("demo-toggle").addEventListener("change", e => {
  etat.demo = e.target.checked;
  rafraichir();
});

document.getElementById("export-csv").addEventListener("click", exporterCSV);
document.getElementById("print-report").addEventListener("click", () => window.print());

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) { statsMessage.textContent = "La déconnexion a échoué."; return; }
  window.location.replace("connexion.html");
});

async function demarrer() {
  const autorise = await verifierAdministrateur();
  if (!autorise) return;

  statsMessage.textContent = "Chargement des statistiques...";
  try {
    await chargerReel();
    statsMessage.textContent = "";
  } catch (erreur) {
    console.error("Erreur statistiques :", erreur);
    statsMessage.textContent = "Impossible de charger les commandes. Vérifiez les autorisations Supabase.";
  }
  rafraichir();
}

demarrer();