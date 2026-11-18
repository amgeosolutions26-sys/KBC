// KBC Admin – page Ventes (lecture seule)
// Une "vente" = une commande qui n'est pas annulée. Montants en FCFA.

const adminName = document.getElementById("admin-name");
const salesMessage = document.getElementById("sales-message");

const STATUTS = {
  en_attente:     "En attente",
  confirmee:      "Confirmée",
  en_preparation: "En préparation",
  expediee:       "Expédiée",
  livree:         "Livrée",
  annulee:        "Annulée"
};

const MODES_PAIEMENT = {
  wave: "Wave",
  orange_money: "Orange Money",
  livraison: "À la livraison"
};

const PAIEMENTS = {
  en_attente: "En attente",
  paye: "Payé",
  payee: "Payé",
  partiel: "Partiel",
  rembourse: "Remboursé",
  echoue: "Échoué"
};

const PERIODES = {
  "7": 7, "30": 30, "90": 90, "365": 365, "tout": null
};

const PAR_PAGE = 20;

const etat = {
  commandes: [],
  periode: "30",
  page: 1,
  filtrees: []
};

/* ---------- Outils ---------- */

function el(tag, classe, texte) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

function fcfa(n) {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR") + " FCFA";
}

function nombre(n) {
  return Math.round(Number(n) || 0).toLocaleString("fr-FR");
}

function normaliser(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formaterDate(d) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
}

function formaterHeure(d) {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function debutJour(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function finJour(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function dateDepuisInput(valeur, fin) {
  if (!valeur) return null;
  const [a, m, j] = valeur.split("-").map(Number);
  const d = new Date(a, m - 1, j);
  return fin ? finJour(d) : debutJour(d);
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

/* ---------- Données ---------- */

async function chargerCommandes() {
  const { data, error } = await db
    .from("commandes")
    .select("id, numero_commande, nom_client, telephone, ville, mode_paiement, statut, statut_paiement, montant_total, created_at, commande_articles(nom_produit, quantite, sous_total)")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw error;

  etat.commandes = (data || []).map(c => ({
    id: c.id,
    reference: c.numero_commande || c.id.slice(0, 8),
    client: c.nom_client || "—",
    tel: c.telephone || "",
    ville: c.ville || "",
    paiement: c.mode_paiement,
    statutPaiement: c.statut_paiement,
    statut: c.statut,
    montant: Number(c.montant_total) || 0,
    date: new Date(c.created_at),
    articles: (c.commande_articles || []).map(a => ({
      nom: a.nom_produit || "Produit",
      qte: Number(a.quantite) || 0,
      total: Number(a.sous_total) || 0
    }))
  }));
}

/* ---------- Filtres ---------- */

function bornes() {
  const du = dateDepuisInput(document.getElementById("date-from").value, false);
  const au = dateDepuisInput(document.getElementById("date-to").value, true);

  if (du || au) return { debut: du, fin: au, perso: true };

  const jours = PERIODES[etat.periode];
  if (!jours) return { debut: null, fin: null, perso: false };

  const debut = debutJour(new Date());
  debut.setDate(debut.getDate() - (jours - 1));
  return { debut, fin: null, perso: false };
}

function filtrer() {
  const { debut, fin } = bornes();
  const type = document.getElementById("filter-type").value;
  const paiement = document.getElementById("filter-paiement").value;
  const recherche = normaliser(document.getElementById("search-sales").value.trim());

  const liste = etat.commandes.filter(c => {
    if (debut && c.date < debut) return false;
    if (fin && c.date > fin) return false;

    if (type === "ventes" && c.statut === "annulee") return false;
    if (type === "livrees" && c.statut !== "livree") return false;
    if (type === "annulees" && c.statut !== "annulee") return false;

    if (paiement !== "tous" && c.paiement !== paiement) return false;

    if (recherche) {
      const texte = normaliser([
        c.reference, c.client, c.tel, c.ville,
        ...c.articles.map(a => a.nom)
      ].join(" "));
      if (!texte.includes(recherche)) return false;
    }
    return true;
  });

  const tri = document.getElementById("sort-sales").value;
  liste.sort((a, b) => tri === "montant" ? b.montant - a.montant : b.date - a.date);
  return liste;
}

/* ---------- Affichage ---------- */

function afficherResume(liste) {
  const type = document.getElementById("filter-type").value;
  const total = liste.reduce((s, c) => s + c.montant, 0);
  const livrees = liste.filter(c => c.statut === "livree");
  const enCours = liste.filter(c => c.statut !== "livree" && c.statut !== "annulee");
  const montantLivrees = livrees.reduce((s, c) => s + c.montant, 0);
  const montantEnCours = enCours.reduce((s, c) => s + c.montant, 0);
  const articles = liste.reduce((s, c) => s + c.articles.reduce((x, a) => x + a.qte, 0), 0);

  document.getElementById("kpi-label").textContent =
    type === "annulees" ? "Montant annulé" : type === "livrees" ? "Ventes livrées" : "Montant des ventes";
  document.getElementById("kpi-total").textContent = fcfa(total);
  document.getElementById("kpi-total-sub").textContent = "somme des montants des commandes";
  document.getElementById("kpi-count").textContent = nombre(liste.length);
  document.getElementById("kpi-count-sub").textContent = type === "annulees" ? "commandes annulées" : "commandes non annulées";
  document.getElementById("kpi-avg").textContent = fcfa(liste.length ? total / liste.length : 0);
  document.getElementById("kpi-delivered").textContent = fcfa(montantLivrees);
  document.getElementById("kpi-delivered-sub").textContent = livrees.length + " commande" + (livrees.length > 1 ? "s" : "") + " livrée" + (livrees.length > 1 ? "s" : "");
  document.getElementById("kpi-pending").textContent = fcfa(montantEnCours);
  document.getElementById("kpi-pending-sub").textContent = enCours.length + " commande" + (enCours.length > 1 ? "s" : "") + " à traiter ou en route";
  document.getElementById("kpi-items").textContent = nombre(articles);
}

function afficherTopProduits(liste) {
  const zone = document.getElementById("top-products");
  zone.replaceChildren();

  const parProduit = new Map();
  liste.forEach(c => c.articles.forEach(a => {
    const x = parProduit.get(a.nom) || { qte: 0, ca: 0 };
    x.qte += a.qte;
    x.ca += a.total;
    parProduit.set(a.nom, x);
  }));

  const top = [...parProduit.entries()].sort((a, b) => b[1].ca - a[1].ca).slice(0, 8);
  if (!top.length) {
    zone.appendChild(el("p", "st-vide", "Aucun produit sur cette sélection."));
    return;
  }

  const max = Math.max(...top.map(([, x]) => x.ca), 1);
  top.forEach(([nom, x]) => {
    const ligne = el("div", "st-bar-row");
    const tete = el("div", "st-bar-head");
    tete.append(el("span", "st-bar-label", nom), el("strong", "", fcfa(x.ca)));
    const piste = el("div", "st-track");
    const rempli = el("div", "st-fill");
    rempli.style.width = Math.max(3, (x.ca / max) * 100) + "%";
    piste.appendChild(rempli);
    ligne.append(tete, piste, el("small", "st-bar-detail", x.qte + " vendu" + (x.qte > 1 ? "s" : "")));
    zone.appendChild(ligne);
  });
}

function badge(texte, classe) {
  return el("span", "vt-badge " + classe, texte);
}

function resumeArticles(c) {
  if (!c.articles.length) return "—";
  const premiers = c.articles.slice(0, 2).map(a => `${a.qte} × ${a.nom}`).join(", ");
  const reste = c.articles.length - 2;
  return reste > 0 ? `${premiers} +${reste}` : premiers;
}

function afficherTableau(liste) {
  const corps = document.getElementById("sales-table-body");
  corps.replaceChildren();

  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  etat.page = Math.min(etat.page, pages);
  const debut = (etat.page - 1) * PAR_PAGE;

  liste.slice(debut, debut + PAR_PAGE).forEach(c => {
    const tr = document.createElement("tr");

    const tdDate = el("td", "vt-nowrap");
    tdDate.append(document.createTextNode(formaterDate(c.date)), el("small", "order-ref", formaterHeure(c.date)));

    const tdRef = el("td", "vt-ref", c.reference);

    const tdClient = el("td");
    tdClient.append(el("strong", "", c.client), el("small", "order-ref", [c.tel, c.ville].filter(Boolean).join(" · ")));

    const tdArticles = el("td", "vt-articles", resumeArticles(c));

    const tdPaiement = el("td");
    tdPaiement.append(
      document.createTextNode(MODES_PAIEMENT[c.paiement] || c.paiement || "—"),
      el("small", "order-ref", PAIEMENTS[c.statutPaiement] || c.statutPaiement || "")
    );

    const tdStatut = el("td");
    tdStatut.appendChild(badge(STATUTS[c.statut] || c.statut || "—", "st-" + (c.statut || "")));

    const tdMontant = el("td", "vt-right vt-amount", fcfa(c.montant));

    tr.append(tdDate, tdRef, tdClient, tdArticles, tdPaiement, tdStatut, tdMontant);
    corps.appendChild(tr);
  });

  const total = liste.reduce((s, c) => s + c.montant, 0);
  document.getElementById("foot-label").textContent = `Total – ${nombre(liste.length)} commande${liste.length > 1 ? "s" : ""}`;
  document.getElementById("foot-total").textContent = fcfa(total);
  document.getElementById("table-note").textContent =
    liste.length ? `${debut + 1}–${Math.min(debut + PAR_PAGE, liste.length)} sur ${nombre(liste.length)}` : "";

  document.getElementById("pager").hidden = pages <= 1;
  document.getElementById("page-info").textContent = `Page ${etat.page} / ${pages}`;
  document.getElementById("page-prev").disabled = etat.page <= 1;
  document.getElementById("page-next").disabled = etat.page >= pages;
}

function rafraichir() {
  const liste = filtrer();
  etat.filtrees = liste;

  const { debut, fin, perso } = bornes();
  const libelle = perso
    ? `du ${debut ? formaterDate(debut) : "début"} au ${fin ? formaterDate(fin) : "aujourd'hui"}`
    : etat.periode === "tout" ? "sur toute la période"
    : `sur les ${PERIODES[etat.periode]} derniers jours`;
  document.getElementById("print-subtitle").textContent =
    `Journal des ventes ${libelle} – édité le ${new Date().toLocaleDateString("fr-FR")}`;

  document.querySelectorAll(".st-periods button").forEach(b =>
    b.setAttribute("aria-pressed", String(!perso && b.dataset.periode === etat.periode)));

  const vide = liste.length === 0;
  document.getElementById("sales-body").hidden = vide;
  document.getElementById("empty-state").hidden = !vide;
  if (vide) return;

  afficherResume(liste);
  afficherTopProduits(liste);
  afficherTableau(liste);
}

/* ---------- Export CSV ---------- */

function celluleCSV(valeur) {
  let t = String(valeur ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;   // évite l'exécution de formules dans Excel
  return '"' + t.replace(/"/g, '""') + '"';
}

function exporterCSV() {
  const lignes = [["Référence", "Date", "Client", "Téléphone", "Ville", "Articles", "Mode de paiement", "Statut du paiement", "Statut", "Montant (FCFA)"]];
  etat.filtrees.forEach(c => lignes.push([
    c.reference,
    c.date.toLocaleString("fr-FR"),
    c.client,
    c.tel,
    c.ville,
    c.articles.map(a => `${a.qte} x ${a.nom}`).join(" | "),
    MODES_PAIEMENT[c.paiement] || c.paiement,
    PAIEMENTS[c.statutPaiement] || c.statutPaiement,
    STATUTS[c.statut] || c.statut,
    Math.round(c.montant)
  ]));

  const csv = "\ufeff" + lignes.map(l => l.map(celluleCSV).join(";")).join("\r\n");
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  lien.download = "kbc-ventes.csv";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

/* ---------- Événements ---------- */

document.querySelectorAll(".st-periods button").forEach(bouton => {
  bouton.addEventListener("click", () => {
    etat.periode = bouton.dataset.periode;
    document.getElementById("date-from").value = "";
    document.getElementById("date-to").value = "";
    etat.page = 1;
    rafraichir();
  });
});

["date-from", "date-to", "filter-type", "filter-paiement", "sort-sales"].forEach(id =>
  document.getElementById(id).addEventListener("change", () => { etat.page = 1; rafraichir(); }));

document.getElementById("search-sales").addEventListener("input", () => { etat.page = 1; rafraichir(); });

document.getElementById("page-prev").addEventListener("click", () => { etat.page -= 1; afficherTableau(etat.filtrees); });
document.getElementById("page-next").addEventListener("click", () => { etat.page += 1; afficherTableau(etat.filtrees); });

document.getElementById("export-csv").addEventListener("click", exporterCSV);
document.getElementById("print-report").addEventListener("click", () => window.print());

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) { salesMessage.textContent = "La déconnexion a échoué."; return; }
  window.location.replace("connexion.html");
});

async function demarrer() {
  const autorise = await verifierAdministrateur();
  if (!autorise) return;

  try {
    await chargerCommandes();
    salesMessage.textContent = "";
    salesMessage.hidden = true;
  } catch (erreur) {
    console.error("Erreur ventes :", erreur);
    salesMessage.textContent = "Impossible de charger les ventes. Vérifiez les autorisations Supabase.";
  }
  rafraichir();
}

demarrer();