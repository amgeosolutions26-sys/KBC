// Fiche produit : pages/produit.html?id=...
const zoneProduit = document.getElementById("product-detail");

function messageProduit(texte) {
  zoneProduit.innerHTML = "";
  const p = document.createElement("p");
  p.className = "grid-message";
  p.textContent = texte + " ";
  const a = document.createElement("a");
  a.href = "boutique.html";
  a.className = "link-more";
  a.textContent = "Retour à la boutique";
  p.appendChild(a);
  zoneProduit.appendChild(p);
}

function ligne(icone, texte) {
  const li = document.createElement("li");
  const i = document.createElement("i");
  i.className = icone;
  li.append(i, document.createTextNode(texte));
  return li;
}

async function chargerProduit() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) return messageProduit("Produit introuvable.");

  const { data, error } = await db
    .from("produits")
    .select("id, nom, description, prix, image_url, categories(nom), stocks(quantite)")
    .eq("id", id)
    .eq("actif", true)
    .maybeSingle();

  if (error) {
    console.error(error);
    return messageProduit("Impossible de charger ce produit.");
  }
  if (!data) return messageProduit("Ce produit n'existe plus ou n'est plus en vente.");

  document.title = `${data.nom} | KBC`;
  const qte = KBC.quantiteStock(data);

  const wrap = document.createElement("div");
  wrap.className = "product-detail";

  const media = document.createElement("div");
  media.className = "detail-media";
  const img = document.createElement("img");
  img.src = data.image_url || KBC.PLACEHOLDER;
  img.alt = data.nom;
  img.onerror = () => { img.onerror = null; img.src = KBC.PLACEHOLDER; };
  media.appendChild(img);

  const info = document.createElement("div");
  info.className = "detail-info";

  const fil = document.createElement("p");
  fil.className = "breadcrumb";
  const lienBoutique = document.createElement("a");
  lienBoutique.href = "boutique.html";
  lienBoutique.textContent = "Boutique";
  fil.append(lienBoutique, document.createTextNode(data.categories?.nom ? ` / ${data.categories.nom}` : ""));

  const titre = document.createElement("h1");
  titre.textContent = data.nom;

  const prix = document.createElement("p");
  prix.className = "detail-price";
  prix.textContent = `${KBC.formatFCFA(data.prix)} FCFA`;

  info.append(fil, titre, prix);

  if (data.description) {
    const desc = document.createElement("p");
    desc.className = "detail-desc";
    desc.textContent = data.description;
    info.appendChild(desc);
  }

  const achat = document.createElement("div");
  achat.className = "detail-buy";

  const bouton = document.createElement("button");
  bouton.type = "button";
  bouton.className = "btn btn-primary";
  bouton.disabled = qte <= 0;
  const lbl = document.createElement("span");
  lbl.textContent = qte > 0 ? "Ajouter au panier" : "Indisponible";
  bouton.appendChild(lbl);
  bouton.addEventListener("click", () => KBC.ajouterAuPanier(data, 1, ""));

  const stock = document.createElement("p");
  stock.className = "product-stock " + (qte <= 0 ? "out" : qte <= 3 ? "low" : "");
  stock.textContent = qte <= 0 ? "Rupture de stock" : qte <= 3 ? `Plus que ${qte} en stock` : "En stock";

  achat.append(bouton, stock);

  const points = document.createElement("ul");
  points.className = "detail-points";
  points.append(
    ligne("fa-solid fa-mobile-screen-button", "Paiement par Wave ou Orange Money"),
    ligne("fa-solid fa-hand-holding-dollar", "Ou paiement à la livraison"),
    ligne("fa-solid fa-truck-fast", "Livraison à confirmer après votre commande")
  );

  info.append(achat, points);
  wrap.append(media, info);
  zoneProduit.replaceChildren(wrap);
}

chargerProduit();
