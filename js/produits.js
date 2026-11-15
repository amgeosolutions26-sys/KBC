// Accueil : mur de produits qui défilent (hero) + derniers arrivages

// Photos de secours si la base contient moins de 4 produits avec image
const PHOTOS_SECOURS = [
  { nom: "Parfum", image_url: "assets/img/parfum.jpg" },
  { nom: "Montre quartz", image_url: "assets/img/montre_quartz.jpg" },
  { nom: "Chaussure", image_url: "assets/img/chaussure.jpg" },
  { nom: "Baskets", image_url: "assets/img/chaussure1.jpg" }
];

// ============================================================
// IMAGES DU HERO : ajoutez vos propres images ici.
//   1. Copiez l'image dans assets/img/  (de préférence carrée)
//   2. Ajoutez une ligne dans la liste ci-dessous
//   nom       = texte de l'étiquette orange
//   image_url = chemin de l'image
//   lien      = page ouverte au clic
// Elles s'ajoutent aux produits venant de Supabase.
// ============================================================
const IMAGES_HERO = [
  { nom: "iPhone 17", image_url: "assets/img/iphone17.jpg", lien: "pages/boutique.html?categorie=electronique" },
  { nom: "T-shirt", image_url: "assets/img/tshirt.jpg", lien: "pages/boutique.html?categorie=mode" },
  { nom: "Casque", image_url: "assets/img/casque.jpg", lien: "pages/boutique.html?categorie=electronique" },
  { nom: "Chemise", image_url: "assets/img/chemise.jpg", lien: "pages/boutique.html?categorie=mode" },
  { nom: "Écouteurs", image_url: "assets/img/ecouteurs.jpg", lien: "pages/boutique.html?categorie=electronique" },
  { nom: "Maillot Sénégal", image_url: "assets/img/maillot-blanc.jpg", lien: "pages/boutique.html?categorie=maillots" },
  { nom: "Maillot Lions", image_url: "assets/img/maillot-vert.jpg", lien: "pages/boutique.html?categorie=maillots" },
  { nom: "Pantalon", image_url: "assets/img/pantalon.jpg", lien: "pages/boutique.html?categorie=mode" }
];

function creerCarteMur(produit) {
  const carte = document.createElement(produit.lien || produit.id ? "a" : "div");
  carte.className = "wall-card";

  const lien = produit.lien || (produit.id ? `pages/produit.html?id=${encodeURIComponent(produit.id)}` : "");
  if (lien) {
    carte.href = lien;
    carte.tabIndex = -1; // le mur est décoratif : les mêmes liens existent plus bas
  }

  const img = document.createElement("img");
  img.src = produit.image_url;
  img.alt = "";
  img.decoding = "async";
  img.onerror = () => carte.remove();
  carte.appendChild(img);

  if (produit.nom) {
    const nom = document.createElement("span");
    nom.className = "wall-name";
    nom.textContent = produit.nom;
    carte.appendChild(nom);
  }
  return carte;
}

function construireMur(produits) {
  const zone = document.getElementById("wall-tilt");
  if (!zone) return;

  let liste = produits.filter(p => p.image_url).slice(0, 9);
  if (liste.length < 4) liste = liste.concat(PHOTOS_SECOURS);
  // Vos images : une fois dans chaque moitié de la rangée
  const moitie = Math.ceil(liste.length / 2);
  liste = [...IMAGES_HERO, ...liste.slice(0, moitie), ...IMAGES_HERO, ...liste.slice(moitie)];

  const parLigne = Math.max(8, liste.length);
  const reglages = [
    { duree: 90, delai: -10, inverse: false },
    { duree: 110, delai: -45, inverse: true },
    { duree: 100, delai: -25, inverse: false }
  ];

  reglages.forEach((r, i) => {
    const ligne = document.createElement("div");
    ligne.className = "wall-row" + (r.inverse ? " reverse" : "");

    const piste = document.createElement("div");
    piste.className = "wall-track";
    piste.style.setProperty("--dur", r.duree + "s");
    piste.style.setProperty("--delay", r.delai + "s");

    // Deux copies identiques : la boucle est parfaitement continue
    for (let copie = 0; copie < 2; copie++) {
      for (let k = 0; k < parLigne; k++) {
        piste.appendChild(creerCarteMur(liste[(k + i * 3) % liste.length]));
      }
    }
    ligne.appendChild(piste);
    zone.appendChild(ligne);
  });
}

function activerPause() {
  const mur = document.getElementById("hero-wall");
  const bouton = document.getElementById("wall-toggle");
  if (!mur || !bouton) return;

  bouton.addEventListener("click", () => {
    const enPause = mur.classList.toggle("paused");
    bouton.setAttribute("aria-pressed", String(enPause));
    bouton.firstElementChild.textContent = enPause ? "Lecture" : "Pause";
  });
}

async function chargerProduits() {
  const zone = document.getElementById("featured-products");

  try {
    const { data, error } = await db
      .from("produits")
      .select(`id, nom, prix, image_url, categories(nom), stocks(quantite)`)
      .eq("actif", true)
      .order("created_at", { ascending: false })
      .limit(16);

    if (error) throw error;

    construireMur(data || []);

    zone.replaceChildren();

    if (!data || data.length === 0) {
      zone.innerHTML = '<p class="grid-message">Aucun produit disponible pour le moment. Revenez bientôt.</p>';
      return;
    }

    data.slice(0, 8).forEach(produit => zone.appendChild(KBC.creerCarte(produit, "pages/", { sansPrix: true })));
  } catch (error) {
    console.error("Erreur :", error);
    construireMur([]);
    zone.innerHTML = '<p class="grid-message">Impossible de charger les produits. Vérifiez votre connexion et rechargez la page.</p>';
  }
}

activerPause();
chargerProduits();
