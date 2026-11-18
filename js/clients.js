// KBC Admin – page Clients (lecture seule)
// Un "client" = un numéro de téléphone distinct (9 derniers chiffres) parmi les commandes.

const adminName = document.getElementById("admin-name");
const clientsMessage = document.getElementById("clients-message");

const STATUTS = {
  en_attente: "En attente", confirmee: "Confirmée", en_preparation: "En préparation",
  expediee: "Expédiée", livree: "Livrée", annulee: "Annulée"
};

const SEGMENTS = {
  nouveau:    { nom: "Nouveau",       classe: "seg-nouveau" },
  fidele:     { nom: "Fidèle",        classe: "seg-fidele" },
  inactif:    { nom: "Inactif",       classe: "seg-inactif" },
  occasionnel:{ nom: "Occasionnel",   classe: "seg-occasionnel" },
  sans_achat: { nom: "Sans achat",    classe: "seg-sans" }
};

const PAR_PAGE = 20;
const JOUR = 86400000;

const etat = { clients: [], filtres: [], page: 1 };

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

function ilYa(d) {
  const jours = Math.floor((Date.now() - d.getTime()) / JOUR);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  if (jours < 60) return `il y a ${jours} jours`;
  const mois = Math.floor(jours / 30);
  return mois < 24 ? `il y a ${mois} mois` : `il y a ${Math.floor(mois / 12)} ans`;
}

function chiffres(t) {
  return String(t || "").replace(/\D/g, "");
}

// Numéro au format international sans "+", pour les liens WhatsApp (Sénégal : 221)
function numeroInternational(tel) {
  const c = chiffres(tel);
  if (c.length === 9) return "221" + c;
  if (c.startsWith("00")) return c.slice(2);
  return c;
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

async function chargerClients() {
  const { data, error } = await db
    .from("commandes")
    .select("id, numero_commande, nom_client, telephone, ville, statut, montant_total, created_at, commande_articles(nom_produit, quantite)")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw error;

  const groupes = new Map();

  (data || []).forEach(c => {
    const tel = chiffres(c.telephone);
    const cle = tel.length >= 8 ? tel.slice(-9) : "nom:" + normaliser(c.nom_client);

    if (!groupes.has(cle)) {
      groupes.set(cle, {
        cle,
        nom: c.nom_client || "Client sans nom",
        tel: c.telephone || "",
        ville: c.ville || "",
        commandes: []
      });
    }
    groupes.get(cle).commandes.push({
      id: c.id,
      reference: c.numero_commande || c.id.slice(0, 8),
      statut: c.statut,
      montant: Number(c.montant_total) || 0,
      date: new Date(c.created_at),
      articles: (c.commande_articles || []).map(a => ({ nom: a.nom_produit || "Produit", qte: Number(a.quantite) || 0 }))
    });
  });

  const maintenant = Date.now();

  etat.clients = [...groupes.values()].map(g => {
    // Les commandes arrivent de la plus récente à la plus ancienne : nom/ville = les plus récents
    const valides = g.commandes.filter(c => c.statut !== "annulee");
    const total = valides.reduce((s, c) => s + c.montant, 0);
    const derniere = g.commandes[0].date;
    const premiere = g.commandes[g.commandes.length - 1].date;
    const derniereValide = valides.length ? valides[0].date : null;

    let segment;
    if (!valides.length) segment = "sans_achat";
    else if (maintenant - derniereValide.getTime() > 90 * JOUR) segment = "inactif";
    else if (valides.length >= 2) segment = "fidele";
    else if (maintenant - premiere.getTime() <= 30 * JOUR) segment = "nouveau";
    else segment = "occasionnel";

    return {
      ...g,
      valides: valides.length,
      annulees: g.commandes.length - valides.length,
      total,
      panier: valides.length ? total / valides.length : 0,
      derniere,
      premiere,
      segment,
      nouveau: maintenant - premiere.getTime() <= 30 * JOUR
    };
  });
}

/* ---------- Filtres ---------- */

function remplirVilles() {
  const select = document.getElementById("filter-ville");
  const villes = [...new Set(etat.clients.map(c => c.ville).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  villes.forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function filtrer() {
  const recherche = normaliser(document.getElementById("search-clients").value.trim());
  const segment = document.getElementById("filter-segment").value;
  const ville = document.getElementById("filter-ville").value;
  const tri = document.getElementById("sort-clients").value;

  // Recherche par numéro : on compare les 9 derniers chiffres (ignore +221, espaces, tirets)
  const chiffresRecherche = chiffres(recherche);
  const chiffresTel = chiffresRecherche.length > 9 ? chiffresRecherche.slice(-9) : chiffresRecherche;

  const liste = etat.clients.filter(c => {
    if (segment === "nouveau" && !c.nouveau) return false;
    if (segment !== "tous" && segment !== "nouveau" && c.segment !== segment) return false;
    if (ville && c.ville !== ville) return false;
    if (recherche) {
      const parTexte = normaliser([c.nom, c.tel, c.ville].join(" ")).includes(recherche);
      const parNumero = chiffresTel.length >= 3 && chiffres(c.tel).includes(chiffresTel);
      if (!parTexte && !parNumero) return false;
    }
    return true;
  });

  const tris = {
    depense: (a, b) => b.total - a.total || b.valides - a.valides,
    commandes: (a, b) => b.valides - a.valides || b.total - a.total,
    recent: (a, b) => b.derniere - a.derniere,
    nom: (a, b) => a.nom.localeCompare(b.nom, "fr")
  };
  liste.sort(tris[tri]);
  return liste;
}

/* ---------- Affichage ---------- */

function afficherResume() {
  const tous = etat.clients;
  const acheteurs = tous.filter(c => c.valides > 0);
  const fideles = tous.filter(c => c.valides >= 2);
  const nouveaux = tous.filter(c => c.nouveau);
  const totalDepense = acheteurs.reduce((s, c) => s + c.total, 0);

  document.getElementById("kpi-clients").textContent = nombre(tous.length);
  document.getElementById("kpi-clients-sub").textContent = `${nombre(acheteurs.length)} ont au moins un achat`;
  document.getElementById("kpi-new").textContent = nombre(nouveaux.length);
  document.getElementById("kpi-loyal").textContent = nombre(fideles.length);
  document.getElementById("kpi-loyal-sub").textContent = acheteurs.length
    ? `${Math.round((fideles.length / acheteurs.length) * 100)} % des acheteurs`
    : "";
  document.getElementById("kpi-avg").textContent = fcfa(acheteurs.length ? totalDepense / acheteurs.length : 0);
}

function initiales(nom) {
  const mots = String(nom).trim().split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] || "?") + (mots.length > 1 ? mots[mots.length - 1][0] : "")).toUpperCase();
}

function afficherTableau() {
  const corps = document.getElementById("clients-table-body");
  corps.replaceChildren();

  const liste = etat.filtres;
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  etat.page = Math.min(etat.page, pages);
  const debut = (etat.page - 1) * PAR_PAGE;

  document.getElementById("empty-state").hidden = liste.length > 0;
  document.getElementById("clients-table-wrap").hidden = liste.length === 0;

  liste.slice(debut, debut + PAR_PAGE).forEach(c => {
    const tr = document.createElement("tr");
    tr.className = "cl-row";
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", "Ouvrir la fiche de " + c.nom);

    const tdClient = el("td");
    const bloc = el("div", "cl-person");
    bloc.append(el("span", "cl-avatar", initiales(c.nom)));
    const texte = document.createElement("div");
    texte.append(el("strong", "", c.nom), el("small", "order-ref", c.tel));
    bloc.appendChild(texte);
    tdClient.appendChild(bloc);

    const tdCommandes = el("td", "cl-center");
    tdCommandes.append(document.createTextNode(String(c.valides)));
    if (c.annulees) tdCommandes.appendChild(el("small", "order-ref", `${c.annulees} annulée${c.annulees > 1 ? "s" : ""}`));

    const tdDerniere = el("td", "vt-nowrap");
    tdDerniere.append(document.createTextNode(formaterDate(c.derniere)), el("small", "order-ref", ilYa(c.derniere)));

    const tdProfil = el("td");
    const seg = SEGMENTS[c.segment];
    tdProfil.appendChild(el("span", "vt-badge " + seg.classe, seg.nom));

    tr.append(
      tdClient,
      el("td", "", c.ville || "—"),
      tdCommandes,
      el("td", "vt-right vt-amount", fcfa(c.total)),
      el("td", "vt-right", c.valides ? fcfa(c.panier) : "—"),
      tdDerniere,
      tdProfil
    );

    tr.addEventListener("click", () => ouvrirFiche(c));
    tr.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ouvrirFiche(c); }
    });
    corps.appendChild(tr);
  });

  document.getElementById("pager").hidden = pages <= 1;
  document.getElementById("page-info").textContent =
    `Page ${etat.page} / ${pages} – ${nombre(liste.length)} client${liste.length > 1 ? "s" : ""}`;
  document.getElementById("page-prev").disabled = etat.page <= 1;
  document.getElementById("page-next").disabled = etat.page >= pages;
}

function rafraichir() {
  etat.filtres = filtrer();
  afficherTableau();
}

/* ---------- Fiche client ---------- */

function fait(dl, titre, valeur) {
  const bloc = document.createElement("div");
  bloc.append(el("dt", "", titre), el("dd", "", valeur));
  dl.appendChild(bloc);
}

function ouvrirFiche(c) {
  document.getElementById("dialog-name").textContent = c.nom;
  document.getElementById("dialog-sub").textContent = [c.tel, c.ville].filter(Boolean).join(" · ");

  const appel = document.getElementById("dialog-call");
  const wa = document.getElementById("dialog-wa");
  const intl = numeroInternational(c.tel);
  const joignable = intl.length >= 9;
  appel.hidden = !joignable;
  wa.hidden = !joignable;
  if (joignable) {
    appel.href = "tel:+" + intl;
    wa.href = "https://wa.me/" + intl;
  }

  const faits = document.getElementById("dialog-facts");
  faits.replaceChildren();
  fait(faits, "Commandes", `${c.valides}` + (c.annulees ? ` (+${c.annulees} annulée${c.annulees > 1 ? "s" : ""})` : ""));
  fait(faits, "Total dépensé", fcfa(c.total));
  fait(faits, "Panier moyen", c.valides ? fcfa(c.panier) : "—");
  fait(faits, "Première commande", formaterDate(c.premiere));
  fait(faits, "Dernière commande", `${formaterDate(c.derniere)} (${ilYa(c.derniere)})`);
  fait(faits, "Profil", SEGMENTS[c.segment].nom);

  // Produits achetés (commandes non annulées)
  const produits = new Map();
  c.commandes.filter(o => o.statut !== "annulee").forEach(o => o.articles.forEach(a =>
    produits.set(a.nom, (produits.get(a.nom) || 0) + a.qte)));
  const liste = document.getElementById("dialog-products");
  liste.replaceChildren();
  const top = [...produits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!top.length) liste.appendChild(el("li", "st-vide", "Aucun achat."));
  top.forEach(([nom, qte]) => {
    const li = el("li");
    li.append(el("span", "", nom), el("strong", "", `${qte} acheté${qte > 1 ? "s" : ""}`));
    liste.appendChild(li);
  });

  const corps = document.getElementById("dialog-orders");
  corps.replaceChildren();
  c.commandes.forEach(o => {
    const tr = document.createElement("tr");
    tr.append(
      el("td", "vt-nowrap", formaterDate(o.date)),
      el("td", "vt-ref", o.reference)
    );
    const tdStatut = el("td");
    tdStatut.appendChild(el("span", "vt-badge st-" + (o.statut || ""), STATUTS[o.statut] || o.statut || "—"));
    tr.append(tdStatut, el("td", "vt-right vt-amount", fcfa(o.montant)));
    corps.appendChild(tr);
  });

  const dialog = document.getElementById("client-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

/* ---------- Export CSV ---------- */

function celluleCSV(valeur) {
  let t = String(valeur ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;   // évite l'exécution de formules dans Excel
  return '"' + t.replace(/"/g, '""') + '"';
}

function exporterCSV() {
  const lignes = [["Nom", "Téléphone", "Ville", "Commandes", "Annulées", "Total dépensé (FCFA)", "Panier moyen (FCFA)", "Première commande", "Dernière commande", "Profil"]];
  etat.filtres.forEach(c => lignes.push([
    c.nom, c.tel, c.ville, c.valides, c.annulees, Math.round(c.total), Math.round(c.panier),
    c.premiere.toLocaleDateString("fr-FR"), c.derniere.toLocaleDateString("fr-FR"), SEGMENTS[c.segment].nom
  ]));

  const csv = "\ufeff" + lignes.map(l => l.map(celluleCSV).join(";")).join("\r\n");
  const lien = document.createElement("a");
  lien.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  lien.download = "kbc-clients.csv";
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
}

/* ---------- Événements ---------- */

["filter-segment", "filter-ville", "sort-clients"].forEach(id =>
  document.getElementById(id).addEventListener("change", () => { etat.page = 1; rafraichir(); }));
document.getElementById("search-clients").addEventListener("input", () => { etat.page = 1; rafraichir(); });

document.getElementById("page-prev").addEventListener("click", () => { etat.page -= 1; afficherTableau(); });
document.getElementById("page-next").addEventListener("click", () => { etat.page += 1; afficherTableau(); });

document.getElementById("export-csv").addEventListener("click", exporterCSV);

const dialog = document.getElementById("client-dialog");
document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); }); // clic sur le fond

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();
  if (error) { clientsMessage.textContent = "La déconnexion a échoué."; return; }
  window.location.replace("connexion.html");
});

async function demarrer() {
  const autorise = await verifierAdministrateur();
  if (!autorise) return;

  try {
    await chargerClients();
    clientsMessage.hidden = true;
    remplirVilles();
    afficherResume();
  } catch (erreur) {
    console.error("Erreur clients :", erreur);
    clientsMessage.textContent = "Impossible de charger les clients. Vérifiez les autorisations Supabase.";
  }
  rafraichir();
}

demarrer();