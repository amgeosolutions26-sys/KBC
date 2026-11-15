
const cartItems = document.getElementById("cart-items");
const cartCount = document.getElementById("cart-count");
const cartSubtotal = document.getElementById("cart-subtotal");
const cartTotal = document.getElementById("cart-total");
const checkoutButton = document.getElementById("checkout-button");

function lirePanier() {
  try {
    const panier = JSON.parse(localStorage.getItem("kbc_panier") || "[]");
    return Array.isArray(panier) ? panier : [];
  } catch (error) {
    console.error("Erreur de lecture du panier :", error);
    return [];
  }
}

function enregistrerPanier(panier) {
  localStorage.setItem("kbc_panier", JSON.stringify(panier));
}

function formatFCFA(montant) {
  return Number(montant).toLocaleString("fr-FR") + " FCFA";
}

function actualiserPanier() {
  const panier = lirePanier();

  cartItems.replaceChildren();

  const nombreArticles = panier.reduce(
    (total, article) => total + Number(article.quantite || 0),
    0
  );

  const montantTotal = panier.reduce(
    (total, article) =>
      total + Number(article.prix || 0) * Number(article.quantite || 0),
    0
  );

  cartCount.textContent = nombreArticles > 0 ? nombreArticles : "";
  cartSubtotal.textContent = formatFCFA(montantTotal);
  cartTotal.textContent = formatFCFA(montantTotal);

  if (panier.length === 0) {
    const message = document.createElement("p");
    message.className = "empty-cart";
    message.textContent = "Votre panier est vide.";

    const lien = document.createElement("a");
    lien.href = "boutique.html";
    lien.className = "checkout-button";
    lien.textContent = "Découvrir la boutique";

    cartItems.append(message, lien);
    checkoutButton.classList.add("disabled");
    checkoutButton.setAttribute("aria-disabled", "true");
    checkoutButton.removeAttribute("href");
    return;
  }

  checkoutButton.classList.remove("disabled");
  checkoutButton.setAttribute("aria-disabled", "false");
  checkoutButton.href = "commande.html";

  panier.forEach(article => {
    const ligne = document.createElement("article");
    ligne.className = "cart-item";

    const image = document.createElement("img");
    image.src = article.image_url || KBC.PLACEHOLDER;
    image.alt = article.nom || "Produit";
    image.onerror = () => {
      image.src = KBC.PLACEHOLDER;
    };

    const details = document.createElement("div");
    details.className = "cart-item-details";

    const nom = document.createElement("h3");
    nom.textContent = article.nom || "Produit sans nom";

    const prix = document.createElement("p");
    prix.className = "cart-item-price";
    prix.textContent = formatFCFA(article.prix);

    const sousTotal = document.createElement("p");
    sousTotal.className = "cart-item-subtotal";
    sousTotal.textContent = "Sous-total : " +
      formatFCFA(Number(article.prix) * Number(article.quantite));

    const actions = document.createElement("div");
    actions.className = "cart-item-actions";

    const diminuer = document.createElement("button");
    diminuer.type = "button";
    diminuer.textContent = "−";
    diminuer.setAttribute("aria-label", "Diminuer la quantité");

    diminuer.addEventListener("click", () => {
      modifierQuantite(article.produit_id, -1);
    });

    const quantite = document.createElement("span");
    quantite.textContent = article.quantite;

    const augmenter = document.createElement("button");
    augmenter.type = "button";
    augmenter.textContent = "+";
    augmenter.setAttribute("aria-label", "Augmenter la quantité");

    augmenter.addEventListener("click", () => {
      modifierQuantite(article.produit_id, 1);
    });

    const supprimer = document.createElement("button");
    supprimer.type = "button";
    supprimer.className = "remove-item";
    supprimer.textContent = "Supprimer";

    supprimer.addEventListener("click", () => {
      supprimerArticle(article.produit_id);
    });

    actions.append(diminuer, quantite, augmenter, supprimer);
    details.append(nom, prix, sousTotal, actions);
    ligne.append(image, details);

    cartItems.appendChild(ligne);
  });
}

function modifierQuantite(produitId, variation) {
  const panier = lirePanier();
  const article = panier.find(
    item => item.produit_id === produitId
  );

  if (!article) return;

  article.quantite = Number(article.quantite) + variation;

  if (article.quantite <= 0) {
    supprimerArticle(produitId);
    return;
  }

  enregistrerPanier(panier);
  actualiserPanier();
}

function supprimerArticle(produitId) {
  const panier = lirePanier().filter(
    item => item.produit_id !== produitId
  );

  enregistrerPanier(panier);
  actualiserPanier();
}

actualiserPanier();
