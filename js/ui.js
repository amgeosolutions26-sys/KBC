// KBC – utilitaires partagés (carte produit, panier, notifications)
(function () {
  const CLE_PANIER = "kbc_panier";

  const PLACEHOLDER =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
      '<rect width="400" height="500" fill="#f2f2f0"/>' +
      '<path d="M40 380 C140 300 260 250 360 200" stroke="#ff6a00" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '<path d="M40 410 C150 340 270 290 360 245" stroke="#141414" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<text x="200" y="170" text-anchor="middle" font-family="Arial Black,Arial" font-style="italic" font-weight="900" font-size="64" fill="#141414">KBC</text>' +
      "</svg>"
    );

  function formatFCFA(montant) {
    return Number(montant || 0).toLocaleString("fr-FR");
  }

  function lirePanier() {
    try {
      const p = JSON.parse(localStorage.getItem(CLE_PANIER) || "[]");
      return Array.isArray(p) ? p : [];
    } catch (e) {
      return [];
    }
  }

  function majCompteur() {
    const total = lirePanier().reduce((s, a) => s + Number(a.quantite || 0), 0);
    document.querySelectorAll("#cart-count").forEach(el => {
      el.textContent = total > 0 ? total : "";
    });
  }

  let timerToast;
  function toast(message, lien) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.replaceChildren(document.createTextNode(message));
    if (lien) {
      const a = document.createElement("a");
      a.href = lien.href;
      a.textContent = lien.texte;
      el.appendChild(a);
    }
    el.classList.add("show");
    clearTimeout(timerToast);
    timerToast = setTimeout(() => el.classList.remove("show"), 3500);
  }

  function quantiteStock(produit) {
    const s = Array.isArray(produit.stocks) ? produit.stocks[0] : produit.stocks;
    return Number(s?.quantite ?? 0);
  }

  function ajouterAuPanier(produit, quantite = 1, base = "") {
    const panier = lirePanier();
    const existant = panier.find(i => i.produit_id === produit.id);
    if (existant) existant.quantite += quantite;
    else {
      panier.push({
        produit_id: produit.id,
        nom: produit.nom,
        prix: Number(produit.prix),
        image_url: produit.image_url,
        quantite
      });
    }
    localStorage.setItem(CLE_PANIER, JSON.stringify(panier));
    majCompteur();
    toast("Ajouté au panier.", { href: base + "panier.html", texte: "Voir le panier" });
  }

  // base = dossier des pages depuis la page courante ("pages/" depuis l'accueil, "" ailleurs)
  function creerCarte(produit, base = "", options = {}) {
    const qte = quantiteStock(produit);
    const lien = `${base}produit.html?id=${encodeURIComponent(produit.id)}`;

    const carte = document.createElement("article");
    carte.className = "product-card";

    const media = document.createElement("a");
    media.className = "product-media";
    media.href = lien;
    media.setAttribute("aria-label", produit.nom);

    const img = document.createElement("img");
    img.src = produit.image_url || PLACEHOLDER;
    img.alt = produit.nom;
    img.loading = "lazy";
    img.onerror = () => { img.onerror = null; img.src = PLACEHOLDER; };
    media.appendChild(img);

    if (qte <= 0) {
      const b = document.createElement("span");
      b.className = "badge rupture";
      b.textContent = "Rupture de stock";
      media.appendChild(b);
    } else if (qte <= 3) {
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = `Plus que ${qte}`;
      media.appendChild(b);
    }

    const info = document.createElement("div");
    info.className = "product-info";

    const cat = document.createElement("p");
    cat.className = "product-cat";
    cat.textContent = produit.categories?.nom || "";

    const titre = document.createElement("h3");
    const a = document.createElement("a");
    a.href = lien;
    a.textContent = produit.nom;
    titre.appendChild(a);

    const pied = document.createElement("div");
    pied.className = "product-foot";

    const prix = document.createElement("p");
    prix.className = "product-price";
    prix.append(formatFCFA(produit.prix));
    const dev = document.createElement("small");
    dev.textContent = " FCFA";
    prix.appendChild(dev);

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "add-cart";
    bouton.disabled = qte <= 0;
    const lbl = document.createElement("span");
    lbl.textContent = qte > 0 ? "Ajouter" : "Indisponible";
    bouton.appendChild(lbl);
    bouton.addEventListener("click", () => ajouterAuPanier(produit, 1, base));

    if (options.sansPrix) {
      // Accueil : pas de prix, un simple lien vers la fiche produit
      const voir = document.createElement("a");
      voir.className = "add-cart";
      voir.href = lien;
      const t = document.createElement("span");
      t.textContent = "Voir le produit";
      voir.appendChild(t);
      pied.appendChild(voir);
    } else {
      pied.append(prix, bouton);
    }
    info.append(cat, titre, pied);
    carte.append(media, info);
    return carte;
  }

  window.KBC = { formatFCFA, lirePanier, majCompteur, toast, ajouterAuPanier, creerCarte, quantiteStock, PLACEHOLDER };
  document.addEventListener("DOMContentLoaded", majCompteur);
})();
