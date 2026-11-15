// Suivi de commande : téléphone + code personnel (fonction SQL kbc_consulter_commande)

const trackForm = document.getElementById("track-form");
const trackPhone = document.getElementById("track-phone");
const trackCode = document.getElementById("track-code");
const trackSubmit = document.getElementById("track-submit");
const trackMessage = document.getElementById("track-message");
const trackOutput = document.getElementById("track-output");

const ETAPES = [
  ["en_attente", "En attente"],
  ["confirmee", "Confirmée"],
  ["en_preparation", "En préparation"],
  ["expediee", "Expédiée"],
  ["livree", "Livrée"]
];

const LIBELLES_STATUT = Object.fromEntries(ETAPES.concat([["annulee", "Annulée"]]));

const MODES_PAIEMENT = {
  wave: "Wave",
  orange_money: "Orange Money",
  livraison: "Paiement à la livraison"
};

const LIBELLES_PAIEMENT = {
  en_attente: "En attente",
  paye: "Payé",
  payee: "Payé",
  partiel: "Partiel",
  rembourse: "Remboursé",
  echoue: "Échoué"
};

const MAX_ECHECS = 5;
const ATTENTE_SECONDES = 30;
let echecs = 0;

function fcfa(montant) {
  return Number(montant || 0).toLocaleString("fr-FR") + " FCFA";
}

function formaterDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function libelle(table, valeur) {
  if (!valeur) return "—";
  return table[valeur] || String(valeur).replace(/_/g, " ");
}

function afficherMessage(texte, type) {
  trackMessage.textContent = texte;
  trackMessage.className = type || "";
}

function el(tag, classe, texte) {
  const n = document.createElement(tag);
  if (classe) n.className = classe;
  if (texte !== undefined) n.textContent = texte;
  return n;
}

function info(dl, titre, valeur) {
  const bloc = document.createElement("div");
  bloc.append(el("dt", "", titre), el("dd", "", valeur));
  dl.appendChild(bloc);
}

function normaliserCode(valeur) {
  return valeur.replace(/\s+/g, "").toUpperCase();
}

let identifiants = null; // gardés en mémoire uniquement, jamais stockés

function creerBlocAnnulation() {
  const bloc = el("section", "track-section track-cancel");
  bloc.appendChild(el("h3", "", "Annuler la commande"));
  bloc.appendChild(el(
    "p", "track-hint",
    "Vous pouvez annuler cette commande tant qu'elle est « En attente ». Une fois confirmée par KBC, elle ne peut plus être annulée en ligne."
  ));

  const message = el("p", "track-cancel-message");
  message.setAttribute("role", "status");

  const etapeUn = el("div", "track-cancel-actions");
  const demander = el("button", "btn btn-danger");
  demander.type = "button";
  demander.appendChild(el("span", "", "Annuler ma commande"));
  etapeUn.appendChild(demander);

  const etapeDeux = el("div", "track-cancel-confirm");
  etapeDeux.hidden = true;
  etapeDeux.appendChild(el("p", "", "Confirmer l'annulation ? Cette action est définitive."));
  const rangee = el("div", "track-cancel-actions");
  const oui = el("button", "btn btn-danger");
  oui.type = "button";
  oui.appendChild(el("span", "", "Oui, annuler"));
  const non = el("button", "btn btn-line");
  non.type = "button";
  non.appendChild(el("span", "", "Non, garder"));
  rangee.append(oui, non);
  etapeDeux.appendChild(rangee);

  demander.addEventListener("click", () => {
    etapeUn.hidden = true;
    etapeDeux.hidden = false;
    oui.focus();
  });
  non.addEventListener("click", () => {
    etapeDeux.hidden = true;
    etapeUn.hidden = false;
    message.textContent = "";
    demander.focus();
  });
  oui.addEventListener("click", () => annulerCommande(oui, non, message));

  bloc.append(etapeUn, etapeDeux, message);
  return bloc;
}

async function rafraichirCommande() {
  const { data } = await db.rpc("kbc_consulter_commande", {
    p_telephone: identifiants.telephone,
    p_code_suivi: identifiants.code
  });
  if (data && data.success === true) {
    afficherCommande(data);
    return true;
  }
  return false;
}

async function annulerCommande(oui, non, message) {
  if (!identifiants) return;

  oui.disabled = true;
  non.disabled = true;
  message.className = "track-cancel-message";
  message.textContent = "Annulation en cours...";

  try {
    const { data, error } = await db.rpc("kbc_annuler_commande", {
      p_telephone: identifiants.telephone,
      p_code_suivi: identifiants.code
    });

    if (error) throw error;

    if (data && data.success === true) {
      if (!(await rafraichirCommande())) {
        trackOutput.replaceChildren(el("p", "track-cancelled", "Votre commande a été annulée."));
      }
      if (window.KBC) KBC.toast("Commande annulée.");
      return;
    }

    // Statut modifié entre-temps (ex. confirmée par KBC) : on affiche l'état à jour
    if (data && data.code === "non_annulable") {
      await rafraichirCommande();
      if (window.KBC) KBC.toast(data.message || "Cette commande ne peut plus être annulée.");
      return;
    }

    message.className = "track-cancel-message error";
    message.textContent = "Impossible d'annuler la commande. Vérifiez vos informations et réessayez.";
  } catch (erreur) {
    console.error("Erreur d'annulation :", erreur);
    message.className = "track-cancel-message error";
    message.textContent = "Impossible d'annuler la commande pour le moment. Vérifiez votre connexion et réessayez.";
  }

  oui.disabled = false;
  non.disabled = false;
}

function afficherCommande(c) {
  const racine = el("article", "track-result");

  // En-tête
  const tete = el("div", "track-head");
  const titres = document.createElement("div");
  titres.append(
    el("h2", "", "Commande " + c.numero_commande),
    el("p", "", "Passée le " + formaterDate(c.created_at))
  );
  const pastille = el("span", "status-pill " + (c.statut || ""), libelle(LIBELLES_STATUT, c.statut));
  tete.append(titres, pastille);
  racine.appendChild(tete);

  // Progression ou annulation
  if (c.statut === "annulee") {
    racine.appendChild(el("p", "track-cancelled", "Cette commande a été annulée."));
  } else {
    const indexActuel = Math.max(0, ETAPES.findIndex(([cle]) => cle === c.statut));
    const liste = el("ol", "track-steps");
    liste.setAttribute("aria-label", "Progression de la commande");
    ETAPES.forEach(([cle, nom], i) => {
      const li = el("li", i < indexActuel ? "done" : i === indexActuel ? "current done" : "", nom);
      if (i === indexActuel) li.setAttribute("aria-current", "step");
      liste.appendChild(li);
    });
    racine.appendChild(liste);
  }

  // Note de paiement
  const mobile = c.mode_paiement === "wave" || c.mode_paiement === "orange_money";
  if (mobile && c.statut_paiement === "en_attente" && c.statut !== "annulee") {
    racine.appendChild(el(
      "p", "track-note",
      "Paiement " + libelle(MODES_PAIEMENT, c.mode_paiement) +
      " en attente. Les modalités vous sont communiquées par KBC après confirmation de la commande."
    ));
  }

  // Livraison et paiement
  const sectionInfos = el("section", "track-section");
  sectionInfos.appendChild(el("h3", "", "Livraison et paiement"));
  const dl = el("dl", "track-info");
  info(dl, "Nom", c.nom_client || "—");
  info(dl, "Ville", c.ville || "—");
  info(dl, "Adresse", c.adresse || "—");
  info(dl, "Mode de paiement", libelle(MODES_PAIEMENT, c.mode_paiement));
  info(dl, "Statut du paiement", libelle(LIBELLES_PAIEMENT, c.statut_paiement));
  info(dl, "Dernière mise à jour", formaterDate(c.updated_at));
  sectionInfos.appendChild(dl);
  racine.appendChild(sectionInfos);

  // Articles
  const sectionArticles = el("section", "track-section");
  sectionArticles.appendChild(el("h3", "", "Articles"));
  const lignes = el("div", "track-lines");
  (c.articles || []).forEach(a => {
    const ligne = el("div", "track-line");
    const nom = document.createElement("span");
    nom.append(
      document.createTextNode(a.nom_produit || "Produit"),
      el("small", "", a.quantite + " × " + fcfa(a.prix_unitaire))
    );
    ligne.append(nom, el("strong", "", fcfa(a.sous_total)));
    lignes.appendChild(ligne);
  });
  sectionArticles.appendChild(lignes);

  if (Number(c.frais_livraison) > 0) {
    const frais = el("div", "track-line");
    frais.append(el("span", "", "Frais de livraison"), el("strong", "", fcfa(c.frais_livraison)));
    sectionArticles.appendChild(frais);
  }

  const total = el("div", "track-total");
  total.append(el("span", "", "Total"), el("strong", "", fcfa(c.montant_total)));
  sectionArticles.appendChild(total);
  racine.appendChild(sectionArticles);

  // Annulation possible uniquement tant que la commande est en attente
  if (c.statut === "en_attente") {
    racine.appendChild(creerBlocAnnulation());
  }

  // Pied
  const pied = el("div", "track-foot");
  const nouvelle = el("button", "btn btn-line");
  nouvelle.type = "button";
  nouvelle.appendChild(el("span", "", "Consulter une autre commande"));
  nouvelle.addEventListener("click", () => {
    identifiants = null;
    trackOutput.replaceChildren(trackVideInitial.cloneNode(true));
    trackForm.reset();
    trackPhone.focus();
  });
  pied.appendChild(nouvelle);
  racine.appendChild(pied);

  trackOutput.replaceChildren(racine);
  racine.scrollIntoView({ behavior: "smooth", block: "start" });
}

const trackVideInitial = trackOutput.firstElementChild.cloneNode(true);

function bloquerTemporairement() {
  let reste = ATTENTE_SECONDES;
  trackSubmit.disabled = true;

  const minuteur = setInterval(() => {
    reste -= 1;
    if (reste <= 0) {
      clearInterval(minuteur);
      echecs = 0;
      trackSubmit.disabled = false;
      trackSubmit.textContent = "Consulter ma commande";
      afficherMessage("", "");
      return;
    }
    trackSubmit.textContent = `Réessayer dans ${reste} s`;
  }, 1000);

  trackSubmit.textContent = `Réessayer dans ${reste} s`;
  afficherMessage("Trop de tentatives. Patientez un instant avant de réessayer.", "error");
}

trackForm.addEventListener("submit", async event => {
  event.preventDefault();

  const telephone = trackPhone.value.trim();
  const code = normaliserCode(trackCode.value);
  const telNettoye = telephone.replace(/[\s.-]/g, "");

  if (!/^\+?\d{8,15}$/.test(telNettoye)) {
    afficherMessage("Saisissez le numéro de téléphone utilisé pour la commande.", "error");
    trackPhone.focus();
    return;
  }

  if (!/^KBC-[0-9A-F]{32}$/.test(code)) {
    afficherMessage("Le code doit commencer par KBC- suivi de 32 caractères. Copiez-le depuis votre confirmation de commande.", "error");
    trackCode.focus();
    return;
  }

  afficherMessage("", "");
  trackSubmit.disabled = true;
  trackSubmit.textContent = "Recherche en cours...";
  trackOutput.replaceChildren(el("div", "skeleton track-skeleton"));

  identifiants = { telephone, code };

  try {
    const { data, error } = await db.rpc("kbc_consulter_commande", {
      p_telephone: telephone,
      p_code_suivi: code
    });

    if (error) throw error;

    if (!data || data.success !== true) {
      echecs += 1;
      trackOutput.replaceChildren(trackVideInitial.cloneNode(true));

      if (echecs >= MAX_ECHECS) {
        bloquerTemporairement();
      } else {
        afficherMessage("Aucune commande ne correspond à ce téléphone et à ce code. Vérifiez les deux informations.", "error");
        trackSubmit.disabled = false;
        trackSubmit.textContent = "Consulter ma commande";
      }
      return;
    }

    echecs = 0;
    trackSubmit.disabled = false;
    trackSubmit.textContent = "Consulter ma commande";
    afficherCommande(data);
  } catch (erreur) {
    console.error("Erreur de consultation :", erreur);
    trackOutput.replaceChildren(trackVideInitial.cloneNode(true));
    afficherMessage("Impossible de consulter la commande pour le moment. Vérifiez votre connexion et réessayez.", "error");
    trackSubmit.disabled = false;
    trackSubmit.textContent = "Consulter ma commande";
  }
});
