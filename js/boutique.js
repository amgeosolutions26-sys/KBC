let produits = [];
let categories = [];

const grid = document.getElementById("products-grid");
const searchInput = document.getElementById("search-product");
const categoryFilter = document.getElementById("category-filter");
const resultCount = document.getElementById("result-count");
const shopTitle = document.getElementById("shop-title");

function normaliser(texte) {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// Liens de l'accueil (?categorie=mode) -> mots-clés cherchés dans le nom des catégories
const ALIAS_CATEGORIES = {
  mode: ["mode", "vetement", "habit"],
  chaussures: ["chaussure"],
  montres: ["montre"],
  electronique: ["electronique", "high-tech", "high tech", "telephone"],
  maillots: ["maillot"],
  accessoires: ["accessoire"]
};

function categorieDepuisURL() {
  const param = normaliser(new URLSearchParams(location.search).get("categorie"));
  if (!param) return null;

  const mots = ALIAS_CATEGORIES[param] || [param];
  return categories.find(c => mots.some(m => normaliser(c.nom).includes(m))) || null;
}

async function chargerCategories() {
  const { data, error } = await db
    .from("categories")
    .select("id, nom")
    .eq("actif", true)
    .order("nom");

  if (error) {
    console.error(error);
    return;
  }

  categories = data || [];

  categories.forEach(categorie => {
    const option = document.createElement("option");
    option.value = categorie.id;
    option.textContent = categorie.nom;
    categoryFilter.appendChild(option);
  });

  const depuisURL = categorieDepuisURL();
  if (depuisURL) categoryFilter.value = depuisURL.id;
}

async function chargerProduits() {
  const { data, error } = await db
    .from("produits")
    .select(`
      id, nom, description, prix, image_url, categorie_id,
      categories(nom),
      stocks(quantite)
    `)
    .eq("actif", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    grid.innerHTML = '<p class="grid-message">Impossible de charger les produits. Vérifiez votre connexion et rechargez la page.</p>';
    return;
  }

  produits = data || [];
  afficherProduits();
}

function afficherProduits() {
  const recherche = normaliser(searchInput.value.trim());
  const categorie = categoryFilter.value;

  const resultat = produits.filter(produit => {
    const correspondRecherche = normaliser(produit.nom).includes(recherche);
    const correspondCategorie = !categorie || produit.categorie_id === categorie;
    return correspondRecherche && correspondCategorie;
  });

  const choisie = categories.find(c => c.id === categorie);
  shopTitle.textContent = choisie ? choisie.nom : "Notre boutique";
  resultCount.textContent = `${resultat.length} produit${resultat.length > 1 ? "s" : ""}`;

  grid.replaceChildren();

  if (resultat.length === 0) {
    grid.innerHTML = '<p class="grid-message">Aucun produit ne correspond. Essayez un autre mot ou choisissez « Toutes les catégories ».</p>';
    return;
  }

  resultat.forEach(produit => grid.appendChild(KBC.creerCarte(produit, "")));
}

searchInput.addEventListener("input", afficherProduits);
categoryFilter.addEventListener("change", afficherProduits);

async function initialiserBoutique() {
  await chargerCategories();
  await chargerProduits();
}

initialiserBoutique();
