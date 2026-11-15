const form = document.getElementById("product-form");
const message = document.getElementById("product-message");
const productsTable = document.getElementById("products-table");
const categorySelect = document.getElementById("product-category");
const imageInput = document.getElementById("product-image");
const imagePreview = document.getElementById("image-preview");

let produits = [];
let categories = [];
let imageActuelle = null;

function afficherMessage(texte, erreur = false) {
  message.textContent = texte;
  message.style.color = erreur ? "#dc3545" : "#198754";
}

function formaterFCFA(montant) {
  return Number(montant || 0).toLocaleString("fr-FR") + " FCFA";
}

async function verifierAcces() {
  const { data: sessionData, error: sessionError } =
    await db.auth.getSession();

  if (sessionError || !sessionData.session) {
    window.location.replace("connexion.html");
    return false;
  }

  const user = sessionData.session.user;

  const { data: profil, error } = await db
    .from("profiles")
    .select("nom, role")
    .eq("id", user.id)
    .single();

  if (error || !profil ||
      !["admin", "gestionnaire"].includes(profil.role)) {
    await db.auth.signOut();
    window.location.replace("connexion.html");
    return false;
  }

  document.getElementById("admin-name").textContent =
    profil.nom || user.email;

  return true;
}

async function chargerCategories() {
  const { data, error } = await db
    .from("categories")
    .select("id, nom")
    .eq("actif", true)
    .order("nom");

  if (error) throw error;

  categories = data || [];
  categorySelect.replaceChildren();

  const optionInitiale = document.createElement("option");
  optionInitiale.value = "";
  optionInitiale.textContent = "Choisir une catégorie";
  categorySelect.appendChild(optionInitiale);

  categories.forEach(categorie => {
    const option = document.createElement("option");
    option.value = categorie.id;
    option.textContent = categorie.nom;
    categorySelect.appendChild(option);
  });
}

async function chargerProduits() {
  const { data, error } = await db
    .from("produits")
    .select(`
      id,
      nom,
      description,
      prix,
      prix_achat,
      image_url,
      categorie_id,
      actif,
      categories(nom),
      stocks(quantite, seuil_alerte)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  produits = data || [];
  afficherProduits(produits);
}

function afficherProduits(liste) {
  productsTable.replaceChildren();

  if (!liste.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 7;
    cell.textContent = "Aucun produit enregistré.";
    row.appendChild(cell);
    productsTable.appendChild(row);
    return;
  }

  liste.forEach(produit => {
    const row = document.createElement("tr");

    const photoCell = document.createElement("td");
    const photo = document.createElement("img");
    photo.className = "product-thumbnail";
    photo.alt = "Photo de " + produit.nom;
    photo.src = produit.image_url || "../assets/images/placeholder.png";
    photoCell.appendChild(photo);

    const nomCell = document.createElement("td");
    nomCell.textContent = produit.nom;

    const categorieCell = document.createElement("td");
    categorieCell.textContent = produit.categories?.nom || "Non classé";

    const prixCell = document.createElement("td");
    prixCell.textContent = formaterFCFA(produit.prix);

    const stockCell = document.createElement("td");
    const stock = produit.stocks?.quantite ?? 0;
    stockCell.textContent = stock;

    const etatCell = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "stock-badge";

    if (!produit.actif) {
      badge.textContent = "Désactivé";
      badge.classList.add("badge-danger");
    } else if (stock === 0) {
      badge.textContent = "Rupture";
      badge.classList.add("badge-danger");
    } else if (stock <= (produit.stocks?.seuil_alerte ?? 5)) {
      badge.textContent = "Stock faible";
      badge.classList.add("badge-warning");
    } else {
      badge.textContent = "Disponible";
      badge.classList.add("badge-success");
    }

    etatCell.appendChild(badge);

    const actionsCell = document.createElement("td");

    const editButton = document.createElement("button");
    editButton.textContent = "Modifier";
    editButton.className = "action-button";
    editButton.addEventListener("click", () => modifierProduit(produit.id));

    const toggleButton = document.createElement("button");
    toggleButton.textContent = produit.actif ? "Désactiver" : "Réactiver";
    toggleButton.className = "action-button secondary";
    toggleButton.addEventListener("click", () =>
      changerEtatProduit(produit.id, produit.actif)
    );

    actionsCell.append(editButton, toggleButton);
    row.append(
      photoCell, nomCell, categorieCell,
      prixCell, stockCell, etatCell, actionsCell
    );

    productsTable.appendChild(row);
  });
}

imageInput.addEventListener("change", () => {
  const fichier = imageInput.files[0];

  if (!fichier) {
    imagePreview.hidden = true;
    return;
  }

  const formatsAutorises = [
    "image/jpeg", "image/png", "image/webp"
  ];

  if (!formatsAutorises.includes(fichier.type) ||
      fichier.size > 5 * 1024 * 1024) {
    afficherMessage(
      "Choisis une image JPG, PNG ou WEBP de 5 Mo maximum.",
      true
    );
    imageInput.value = "";
    imagePreview.hidden = true;
    return;
  }

  imagePreview.src = URL.createObjectURL(fichier);
  imagePreview.hidden = false;
});

async function envoyerImage(fichier) {
  if (!fichier) return imageActuelle;

  const extension = fichier.name.split(".").pop().toLowerCase();
  const chemin = `${crypto.randomUUID()}.${extension}`;

  const { error } = await db.storage
    .from("produits")
    .upload(chemin, fichier, {
      contentType: fichier.type,
      upsert: false
    });

  if (error) throw error;

  const { data } = db.storage
    .from("produits")
    .getPublicUrl(chemin);

  return data.publicUrl;
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const saveButton = document.getElementById("save-product-button");
  saveButton.disabled = true;
  saveButton.textContent = "Enregistrement...";
  afficherMessage("");

  try {
    const id = document.getElementById("product-id").value;
    const nom = document.getElementById("product-name").value.trim();
    const categorieId = categorySelect.value;
    const prixAchat = Number(
      document.getElementById("product-price-buy").value
    );
    const prix = Number(
      document.getElementById("product-price").value
    );
    const quantite = Number(
      document.getElementById("product-quantity").value
    );
    const seuil = Number(
      document.getElementById("product-threshold").value
    );
    const description =
      document.getElementById("product-description").value.trim();

    if (!nom || !categorieId ||
        !Number.isSafeInteger(prix) ||
        !Number.isSafeInteger(prixAchat) ||
        !Number.isSafeInteger(quantite) ||
        !Number.isSafeInteger(seuil) ||
        prix < 0 || prixAchat < 0 || quantite < 0 || seuil < 0) {
      throw new Error("Vérifie les informations saisies.");
    }

    const imageUrl = await envoyerImage(imageInput.files[0]);

    const produitData = {
      nom,
      categorie_id: categorieId,
      prix,
      prix_achat: prixAchat,
      description,
      image_url: imageUrl
    };

    let produitId = id;

    if (id) {
      const { error } = await db
        .from("produits")
        .update(produitData)
        .eq("id", id);

      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("produits")
        .insert(produitData)
        .select("id")
        .single();

      if (error) throw error;
      produitId = data.id;
    }

    const { error: stockError } = await db
      .from("stocks")
      .upsert({
        produit_id: produitId,
        quantite,
        seuil_alerte: seuil,
        updated_at: new Date().toISOString()
      }, { onConflict: "produit_id" });

    if (stockError) throw stockError;

    afficherMessage("Produit enregistré avec succès.");
    reinitialiserFormulaire();
    await chargerProduits();

  } catch (error) {
    console.error(error);
    afficherMessage(error.message || "Une erreur est survenue.", true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Enregistrer le produit";
  }
});

function modifierProduit(id) {
  const produit = produits.find(item => item.id === id);
  if (!produit) return;

  document.getElementById("product-id").value = produit.id;
  document.getElementById("product-name").value = produit.nom;
  categorySelect.value = produit.categorie_id || "";
  document.getElementById("product-price-buy").value = produit.prix_achat;
  document.getElementById("product-price").value = produit.prix;
  document.getElementById("product-description").value =
    produit.description || "";
  document.getElementById("product-quantity").value =
    produit.stocks?.quantite ?? 0;
  document.getElementById("product-threshold").value =
    produit.stocks?.seuil_alerte ?? 5;

  imageActuelle = produit.image_url;
  imageInput.value = "";

  if (imageActuelle) {
    imagePreview.src = imageActuelle;
    imagePreview.hidden = false;
  } else {
    imagePreview.hidden = true;
  }

  document.getElementById("form-title").textContent =
    "Modifier le produit";
  document.getElementById("save-product-button").textContent =
    "Enregistrer les modifications";
  document.getElementById("cancel-edit-button").hidden = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function changerEtatProduit(id, actif) {
  const confirmation = window.confirm(
    actif
      ? "Désactiver ce produit ? Il ne sera plus visible dans la boutique."
      : "Réactiver ce produit ?"
  );

  if (!confirmation) return;

  const { error } = await db
    .from("produits")
    .update({ actif: !actif })
    .eq("id", id);

  if (error) {
    afficherMessage(error.message, true);
    return;
  }

  afficherMessage("État du produit mis à jour.");
  await chargerProduits();
}

function reinitialiserFormulaire() {
  form.reset();
  document.getElementById("product-id").value = "";
  document.getElementById("product-quantity").value = 0;
  document.getElementById("product-threshold").value = 5;
  document.getElementById("form-title").textContent = "Ajouter un produit";
  document.getElementById("cancel-edit-button").hidden = true;
  imagePreview.hidden = true;
  imageActuelle = null;
}

document.getElementById("cancel-edit-button")
  .addEventListener("click", reinitialiserFormulaire);

document.getElementById("product-search").addEventListener("input", event => {
  const recherche = event.target.value.toLowerCase().trim();

  const resultats = produits.filter(produit =>
    produit.nom.toLowerCase().includes(recherche) ||
    (produit.categories?.nom || "").toLowerCase().includes(recherche)
  );

  afficherProduits(resultats);
});

document.getElementById("logout-button").addEventListener("click", async () => {
  await db.auth.signOut();
  window.location.replace("connexion.html");
});

async function demarrer() {
  try {
    const autorise = await verifierAcces();
    if (!autorise) return;

    await chargerCategories();
    await chargerProduits();

  } catch (error) {
    console.error(error);
    afficherMessage(
      "Impossible de charger les produits ou les catégories : " +
      error.message,
      true
    );
  }
}

demarrer();