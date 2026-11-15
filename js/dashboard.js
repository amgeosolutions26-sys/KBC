const adminName = document.getElementById("admin-name");
const dashboardMessage = document.getElementById("dashboard-message");
const stockTable = document.getElementById("stock-table");

async function verifierAdministrateur() {
  const { data: sessionData, error: sessionError } =
    await db.auth.getSession();

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

  if (error || !profile ||
      !["admin", "gestionnaire"].includes(profile.role)) {
    await db.auth.signOut();
    window.location.replace("connexion.html");
    return false;
  }

  adminName.textContent = profile.nom || user.email;
  return true;
}

function afficherValeur(id, valeur) {
  document.getElementById(id).textContent =
    Number(valeur).toLocaleString("fr-FR");
}

function afficherStocks(stocks) {
  stockTable.replaceChildren();

  if (!stocks.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Aucun stock enregistré.";
    row.appendChild(cell);
    stockTable.appendChild(row);
    return;
  }

  stocks.forEach((stock) => {
    const row = document.createElement("tr");

    const nom = document.createElement("td");
    nom.textContent = stock.produits?.nom || "Produit inconnu";

    const quantite = document.createElement("td");
    quantite.textContent = stock.quantite;

    const seuil = document.createElement("td");
    seuil.textContent = stock.seuil_alerte;

    const etat = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "stock-badge";

    if (stock.quantite === 0) {
      badge.textContent = "Rupture";
      badge.classList.add("badge-danger");
    } else if (stock.quantite <= stock.seuil_alerte) {
      badge.textContent = "Stock faible";
      badge.classList.add("badge-warning");
    } else {
      badge.textContent = "Disponible";
      badge.classList.add("badge-success");
    }

    etat.appendChild(badge);
    row.append(nom, quantite, seuil, etat);
    stockTable.appendChild(row);
  });
}

async function chargerDashboard() {
  dashboardMessage.textContent = "Chargement des données...";

  try {
    const [productsResult, categoriesResult, stocksResult] =
      await Promise.all([
        db.from("produits")
          .select("id", { count: "exact", head: true })
          .eq("actif", true),

        db.from("categories")
          .select("id", { count: "exact", head: true })
          .eq("actif", true),

        db.from("stocks")
          .select("quantite, seuil_alerte, produits(nom)")
      ]);

    if (productsResult.error) throw productsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    if (stocksResult.error) throw stocksResult.error;

    const stocks = stocksResult.data || [];

    const totalUnits = stocks.reduce(
      (total, stock) => total + Number(stock.quantite || 0), 0
    );

    const lowStock = stocks.filter(
      stock => Number(stock.quantite) > 0 &&
               Number(stock.quantite) <= Number(stock.seuil_alerte)
    ).length;

    const outOfStock = stocks.filter(
      stock => Number(stock.quantite) === 0
    ).length;

    afficherValeur("total-products", productsResult.count || 0);
    afficherValeur("total-categories", categoriesResult.count || 0);
    afficherValeur("total-units", totalUnits);
    afficherValeur("low-stock", lowStock);
    afficherValeur("out-of-stock", outOfStock);

    afficherStocks(stocks);
    dashboardMessage.textContent = "";

  } catch (error) {
    console.error("Erreur dashboard :", error);
    dashboardMessage.textContent =
      "Impossible de charger les données. Vérifie les autorisations Supabase.";
  }
}

document.getElementById("logout-button").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    dashboardMessage.textContent = "La déconnexion a échoué.";
    return;
  }

  window.location.replace("connexion.html");
});

async function demarrerDashboard() {
  const autorise = await verifierAdministrateur();

  if (autorise) {
    await chargerDashboard();
  }
}

demarrerDashboard();