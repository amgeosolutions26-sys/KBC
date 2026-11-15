const stockMessage = document.getElementById("stock-message");
const productSelect = document.getElementById("movement-product");
const movementForm = document.getElementById("movement-form");

let stockProducts = [];

function afficherMessageStock(texte, erreur = false) {
  stockMessage.textContent = texte;
  stockMessage.style.color = erreur ? "#dc3545" : "#198754";
}

async function verifierAccesStock() {
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

function etatStock(quantite, seuil) {
  if (quantite === 0) {
    return { texte: "Rupture", classe: "badge-danger" };
  }

  if (quantite <= seuil) {
    return { texte: "Stock faible", classe: "badge-warning" };
  }

  return { texte: "Disponible", classe: "badge-success" };
}

async function chargerStocks() {
  const { data, error } = await db
    .from("stocks")
    .select(`
      produit_id,
      quantite,
      seuil_alerte,
      produits(nom, actif)
    `)
    .order("updated_at", { ascending: false });

  if (error) throw error;

  stockProducts = (data || []).filter(
    stock => stock.produits?.actif
  );

  afficherEtatStocks();
  remplirListeProduits();
}

function afficherEtatStocks() {
  const tbody = document.getElementById("current-stock-table");
  tbody.replaceChildren();

  const faibles = stockProducts.filter(
    s => Number(s.quantite) > 0 &&
         Number(s.quantite) <= Number(s.seuil_alerte)
  );

  const ruptures = stockProducts.filter(
    s => Number(s.quantite) === 0
  );

  document.getElementById("stock-products").textContent =
    stockProducts.length;

  document.getElementById("stock-low").textContent = faibles.length;
  document.getElementById("stock-empty").textContent = ruptures.length;

  if (!stockProducts.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Aucun stock enregistré.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  stockProducts.forEach(stock => {
    const row = document.createElement("tr");
    const nom = document.createElement("td");
    nom.textContent = stock.produits.nom;

    const quantite = document.createElement("td");
    quantite.textContent = stock.quantite;

    const seuil = document.createElement("td");
    seuil.textContent = stock.seuil_alerte;

    const etat = document.createElement("td");
    const badge = document.createElement("span");
    const resultat = etatStock(
      Number(stock.quantite),
      Number(stock.seuil_alerte)
    );

    badge.className = "stock-badge " + resultat.classe;
    badge.textContent = resultat.texte;
    etat.appendChild(badge);

    row.append(nom, quantite, seuil, etat);
    tbody.appendChild(row);
  });
}

function remplirListeProduits() {
  productSelect.replaceChildren();

  const initial = document.createElement("option");
  initial.value = "";
  initial.textContent = "Choisir un produit";
  productSelect.appendChild(initial);

  stockProducts.forEach(stock => {
    const option = document.createElement("option");
    option.value = stock.produit_id;
    option.textContent =
      `${stock.produits.nom} — Stock : ${stock.quantite}`;
    productSelect.appendChild(option);
  });
}

movementForm.addEventListener("submit", async event => {
  event.preventDefault();

  const button = document.getElementById("movement-button");
  const produitId = productSelect.value;
  const type = document.getElementById("movement-type").value;
  const quantite = Number(
    document.getElementById("movement-quantity").value
  );
  const motif = document.getElementById("movement-reason")
    .value.trim();

  if (!produitId || !Number.isSafeInteger(quantite) || quantite <= 0) {
    afficherMessageStock("Vérifie le produit et la quantité.", true);
    return;
  }

  button.disabled = true;
  button.textContent = "Enregistrement...";
  afficherMessageStock("");

  try {
    const { error } = await db.rpc(
      "kbc_enregistrer_mouvement",
      {
        p_produit_id: produitId,
        p_type: type,
        p_quantite: quantite,
        p_motif: motif || null
      }
    );

    if (error) throw error;

    afficherMessageStock("Mouvement enregistré avec succès !");
    movementForm.reset();

    await chargerStocks();
    await chargerHistorique();

  } catch (error) {
    console.error(error);
    afficherMessageStock(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = "Enregistrer le mouvement";
  }
});

async function chargerHistorique() {
  const tbody = document.getElementById("movement-history");

  const { data, error } = await db
    .from("mouvements_stock")
    .select(`
      created_at,
      type,
      quantite,
      motif,
      produits(nom)
    `)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  tbody.replaceChildren();

  if (!data || !data.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "Aucun mouvement enregistré.";
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  data.forEach(mouvement => {
    const row = document.createElement("tr");

    const date = document.createElement("td");
    date.textContent = new Date(mouvement.created_at)
      .toLocaleString("fr-FR");

    const produit = document.createElement("td");
    produit.textContent = mouvement.produits?.nom || "Produit inconnu";

    const type = document.createElement("td");
    type.textContent =
      mouvement.type === "entree" ? "Entrée" : "Sortie";

    const quantite = document.createElement("td");
    quantite.textContent = mouvement.quantite;

    const motif = document.createElement("td");
    motif.textContent = mouvement.motif || "Non renseigné";

    row.append(date, produit, type, quantite, motif);
    tbody.appendChild(row);
  });
}

document.getElementById("logout-button")
  .addEventListener("click", async () => {
    await db.auth.signOut();
    window.location.replace("connexion.html");
  });

async function demarrerStocks() {
  try {
    const autorise = await verifierAccesStock();
    if (!autorise) return;

    await chargerStocks();
    await chargerHistorique();

  } catch (error) {
    console.error(error);
    afficherMessageStock(
      "Erreur de chargement : " + error.message,
      true
    );
  }
}

demarrerStocks();