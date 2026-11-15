
const checkoutForm = document.getElementById("checkout-form");
const checkoutItems = document.getElementById("checkout-items");
const checkoutTotal = document.getElementById("checkout-total");
const checkoutMessage = document.getElementById("checkout-message");
const submitOrderButton = document.getElementById("submit-order");

function lirePanierCommande() {
  try {
    const panier = JSON.parse(localStorage.getItem("kbc_panier") || "[]");
    return Array.isArray(panier) ? panier : [];
  } catch (error) {
    console.error("Erreur de lecture du panier :", error);
    return [];
  }
}

function formaterFCFA(montant) {
  return Number(montant).toLocaleString("fr-FR") + " FCFA";
}

function afficherMessage(message, type) {
  checkoutMessage.textContent = message;
  checkoutMessage.className = type;
}

function afficherResumeCommande() {
  const panier = lirePanierCommande();
  checkoutItems.replaceChildren();

  let total = 0;

  panier.forEach(article => {
    const quantite = Number(article.quantite);
    const prix = Number(article.prix);

    if (!Number.isInteger(quantite) || quantite <= 0 ||
        !Number.isFinite(prix) || prix < 0) {
      return;
    }

    const sousTotal = prix * quantite;
    total += sousTotal;

    const ligne = document.createElement("div");
    ligne.className = "checkout-item";

    const nom = document.createElement("span");
    nom.textContent = `${article.nom || "Produit"} × ${quantite}`;

    const montant = document.createElement("strong");
    montant.textContent = formaterFCFA(sousTotal);

    ligne.append(nom, montant);
    checkoutItems.appendChild(ligne);
  });

  checkoutTotal.textContent = formaterFCFA(total);

  if (panier.length === 0) {
    const message = document.createElement("p");
    message.textContent = "Votre panier est vide.";
    checkoutItems.appendChild(message);

    submitOrderButton.disabled = true;
    submitOrderButton.textContent = "Panier vide";
  }

  return total;
}

// Afficher le résultat de la commande
function afficherConfirmationCommande(data, modePaiement) {
  checkoutMessage.replaceChildren();
  checkoutMessage.className = "success";

  const carte = document.createElement("div");
  carte.className = "kbc-order-confirmation";

  const titre = document.createElement("h3");
  titre.textContent = "Commande enregistrée avec succès !";

  const texte = document.createElement("p");
  texte.textContent =
    "Merci pour votre commande chez KHAR YALLA BUSINESS CENTER.";

  const reference = document.createElement("p");
  reference.textContent = "Référence : " + data.numero_commande;

  const montant = document.createElement("p");
  montant.textContent =
    "Montant total : " + formaterFCFA(data.montant_total);

  const paiement = document.createElement("p");

  const modes = {
    wave: "Wave",
    orange_money: "Orange Money",
    livraison: "Paiement à la livraison"
  };

  paiement.textContent =
    "Mode de paiement : " + (modes[modePaiement] || modePaiement);

  const codeTitre = document.createElement("h4");
  codeTitre.textContent = "Votre code personnel de suivi";

  const code = document.createElement("strong");
  code.className = "kbc-tracking-code";
  code.textContent = data.code_suivi;

  const avertissement = document.createElement("p");
  avertissement.className = "kbc-tracking-warning";
  avertissement.textContent =
    "Important : conservez ce code. Il sera nécessaire pour consulter et annuler votre commande. Il ne pourra pas être récupéré si vous le perdez.";

  const copier = document.createElement("button");
  copier.type = "button";
  copier.textContent = "Copier mon code";

  copier.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(data.code_suivi);
      copier.textContent = "Code copié !";
    } catch (error) {
      console.error("Erreur de copie :", error);
      avertissement.textContent =
        "La copie automatique a échoué. Sélectionnez et copiez votre code manuellement.";
    }
  });

  const suivi = document.createElement("a");
  suivi.href = "mes-commandes.html";
  suivi.className = "kbc-track-link";
  suivi.textContent = "Suivre ma commande";

  carte.append(
    titre,
    texte,
    reference,
    montant,
    paiement,
    codeTitre,
    code,
    avertissement,
    copier,
    suivi
  );

  checkoutMessage.appendChild(carte);
}

afficherResumeCommande();

// Enregistrement de la commande
checkoutForm.addEventListener("submit", async function(event) {
  event.preventDefault();

  const panier = lirePanierCommande();

  if (panier.length === 0) {
    afficherMessage("Votre panier est vide.", "error");
    return;
  }

  const nomClient =
    document.getElementById("nom_client").value.trim();

  const telephone =
    document.getElementById("telephone").value.trim();

  const adresse =
    document.getElementById("adresse").value.trim();

  const ville =
    document.getElementById("ville").value.trim();

  const modePaiement = checkoutForm.querySelector(
    'input[name="mode_paiement"]:checked'
  )?.value;

  if (!nomClient || !telephone || !adresse || !ville || !modePaiement) {
    afficherMessage(
      "Veuillez remplir tous les champs obligatoires.",
      "error"
    );
    return;
  }

  const telephoneNettoye = telephone.replace(/[\s.-]/g, "");

  if (!/^\+?\d{8,15}$/.test(telephoneNettoye)) {
    afficherMessage(
      "Veuillez saisir un numéro de téléphone valide.",
      "error"
    );
    return;
  }

  const articles = [];

  for (const article of panier) {
    const quantite = Number(article.quantite);

    if (
      !article.produit_id ||
      !Number.isInteger(quantite) ||
      quantite <= 0
    ) {
      afficherMessage(
        "Un article du panier contient des données invalides.",
        "error"
      );
      return;
    }

    articles.push({
      produit_id: article.produit_id,
      quantite: quantite
    });
  }

  submitOrderButton.disabled = true;
  submitOrderButton.textContent = "Enregistrement en cours...";
  afficherMessage("", "");

  try {
    const { data, error } = await db.rpc("kbc_creer_commande", {
      p_nom_client: nomClient,
      p_telephone: telephone,
      p_adresse: adresse,
      p_ville: ville,
      p_mode_paiement: modePaiement,
      p_articles: articles
    });

    if (error) {
      throw error;
    }

    if (
      !data ||
      data.success !== true ||
      !data.code_suivi ||
      !data.numero_commande
    ) {
      throw new Error(
        "La commande a été enregistrée, mais les informations de suivi sont incomplètes. Contactez KBC avant de recommencer."
      );
    }

    // Vider le panier après confirmation par Supabase
    localStorage.removeItem("kbc_panier");

    checkoutForm.reset();
    checkoutItems.replaceChildren();
    checkoutTotal.textContent = formaterFCFA(0);

    // Afficher la confirmation et le code personnel
    afficherConfirmationCommande(data, modePaiement);

    submitOrderButton.textContent = "Commande enregistrée";

  } catch (error) {
    console.error("Erreur lors de la commande :", error);

    afficherMessage(
      error.message || "Une erreur est survenue. Veuillez réessayer.",
      "error"
    );

    submitOrderButton.disabled = false;
    submitOrderButton.textContent = "Réessayer";
  }
});
