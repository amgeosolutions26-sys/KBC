const adminName = document.getElementById("admin-name");
const ordersMessage = document.getElementById("orders-message");
const ordersTableBody = document.getElementById("orders-table-body");
const searchInput = document.getElementById("search-orders");
const statusFilter = document.getElementById("filter-status");
const refreshButton = document.getElementById("refresh-orders");

let toutesLesCommandes = [];

// Numéro d'ordre affiché : 1, 2, 3... (du plus ancien au plus récent).
// Recalculé à chaque chargement : il suit donc les suppressions de commandes.
// Il ne modifie rien dans la base de données.
let numerosAffiches = new Map();

function calculerNumerosAffiches() {
  numerosAffiches = new Map(
    [...toutesLesCommandes]
      .sort((a, b) =>
        new Date(a.created_at) - new Date(b.created_at) ||
        (a.numero || 0) - (b.numero || 0)
      )
      .map((commande, index) => [commande.id, index + 1])
  );
}

function numeroOrdre(commande) {
  return numerosAffiches.get(commande.id) ?? commande.numero ?? commande.id.slice(0, 8);
}

const statuts = {
  en_attente: "En attente",
  confirmee: "Confirmée",
  en_preparation: "En préparation",
  expediee: "Expédiée",
  livree: "Livrée",
  annulee: "Annulée"
};

const moyensPaiement = {
  wave: "Wave",
  orange_money: "Orange Money",
  livraison: "Paiement à la livraison"
};

// Vérification de l'administrateur
async function verifierAccesAdmin() {
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

  if (
    error ||
    !profile ||
    !["admin", "gestionnaire"].includes(profile.role)
  ) {
    await db.auth.signOut();
    window.location.replace("connexion.html");
    return false;
  }

  adminName.textContent = profile.nom || user.email;

  return true;
}

// Formatage des montants
function formaterMontant(montant) {
  return `${Number(montant || 0).toLocaleString("fr-FR")} FCFA`;
}

// Formatage des dates
function formaterDate(date) {
  if (!date) return "—";

  return new Date(date).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Création sécurisée des cellules
function creerCellule(texte) {
  const td = document.createElement("td");
  td.textContent = texte ?? "—";
  return td;
}

// Sélecteur de statut
function creerSelectStatut(commande) {
  const select = document.createElement("select");

  select.className = "order-status-select";

  select.setAttribute(
    "aria-label",
    `Statut de la commande n°${numeroOrdre(commande)}`
  );

  Object.entries(statuts).forEach(([valeur, libelle]) => {
    const option = document.createElement("option");

    option.value = valeur;
    option.textContent = libelle;
    option.selected = commande.statut === valeur;

    select.appendChild(option);
  });

  select.addEventListener("change", async () => {
    const ancienStatut = commande.statut;
    const nouveauStatut = select.value;

    // Demander confirmation avant une annulation
    if (
      nouveauStatut === "annulee" &&
      !window.confirm(
        `Confirmer l'annulation de la commande n°${numeroOrdre(commande)} ?\n\nLe stock des articles sera automatiquement restitué.`
      )
    ) {
      select.value = ancienStatut;
      return;
    }

    select.disabled = true;
    ordersMessage.textContent =
      `Mise à jour de la commande n°${numeroOrdre(commande)}...`;

    try {
      const { error } = await db
        .from("commandes")
        .update({ statut: nouveauStatut })
        .eq("id", commande.id);

      if (error) throw error;

      commande.statut = nouveauStatut;

      ordersMessage.textContent =
      nouveauStatut === "annulee"
      ? `Commande n°${numeroOrdre(commande)} annulée. Le stock a été restitué.`
      : `Le statut de la commande n°${numeroOrdre(commande)} a été mis à jour.`;

    } catch (error) {
      console.error("Erreur de mise à jour :", error);

      select.value = ancienStatut;

      ordersMessage.textContent =
        error.message || "Impossible de modifier le statut.";

    } finally {
      select.disabled = false;
    }
  });

  return select;
}

// Affichage des articles commandés
function creerDetailsArticles(commande) {
  const details = document.createElement("details");
  details.className = "order-details";

  const summary = document.createElement("summary");

  const articles = Array.isArray(commande.commande_articles)
    ? commande.commande_articles
    : [];

  summary.textContent = `${articles.length} article(s)`;

  details.appendChild(summary);

  if (articles.length === 0) {
    const p = document.createElement("p");

    p.textContent = "Aucun détail d'article enregistré.";

    details.appendChild(p);

    return details;
  }

  const liste = document.createElement("ul");

  articles.forEach(article => {
    const item = document.createElement("li");

    item.textContent =
      `${article.nom_produit} × ${article.quantite} — ` +
      formaterMontant(article.sous_total);

    liste.appendChild(item);
  });

  details.appendChild(liste);

  return details;
}


// Création et affichage de la fiche détaillée d'une commande
function afficherDetailsCommande(commande) {
  let modal = document.getElementById("commande-modal");

  if (!modal) {
    modal = document.createElement("div");
    modal.id = "commande-modal";

    modal.innerHTML = `
      <div class="commande-modal-content">
        <button type="button" id="fermer-modal" class="fermer-modal">
          &times;
        </button>
        <h2>Détails de la commande</h2>
        <div id="commande-modal-body"></div>
      </div>
    `;

    document.body.appendChild(modal);

    const style = document.createElement("style");
    style.textContent = `
      #commande-modal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 9999;
        background: rgba(0,0,0,.65);
        padding: 25px;
        overflow-y: auto;
        align-items: center;
        justify-content: center;
      }

      .commande-modal-content {
        background: white;
        color: #222;
        width: 100%;
        max-width: 750px;
        padding: 30px;
        border-radius: 12px;
        position: relative;
        margin: auto;
      }

      .commande-modal-content h2 {
        color: #f58220;
        margin-bottom: 22px;
      }

      .fermer-modal {
        position: absolute;
        top: 12px;
        right: 18px;
        border: none;
        background: none;
        font-size: 30px;
        cursor: pointer;
      }

      .detail-section {
        margin: 20px 0;
        padding-bottom: 15px;
        border-bottom: 1px solid #ddd;
      }

      .detail-section h3 {
        margin-bottom: 12px;
        color: #f58220;
      }

      .detail-section p {
        margin: 8px 0;
      }

      .detail-table {
        width: 100%;
        border-collapse: collapse;
      }

      .detail-table th,
      .detail-table td {
        padding: 10px;
        border: 1px solid #ddd;
        text-align: left;
      }

      .detail-table th {
        background: #f5f5f5;
      }

      .commande-total {
        font-size: 20px;
        font-weight: bold;
        margin-top: 15px;
      }

      .btn-details {
        background: #f58220;
        color: white;
        border: none;
        padding: 8px 12px;
        border-radius: 5px;
        cursor: pointer;
        margin-top: 8px;
      }

      @media(max-width: 600px) {
        .commande-modal-content {
          padding: 20px 12px;
        }

        .detail-table {
          font-size: 12px;
        }
      }
    `;

    document.head.appendChild(style);

    modal.querySelector("#fermer-modal").addEventListener("click", () => {
      modal.style.display = "none";
    });

    modal.addEventListener("click", event => {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });
  }

  const body = modal.querySelector("#commande-modal-body");
  body.replaceChildren();

  const numero = commande.numero_commande ||
    (commande.numero ? `KBC-${commande.numero}` : commande.id.slice(0, 8));

  function ajouterSection(titre, contenu) {
    const section = document.createElement("section");
    section.className = "detail-section";

    const h3 = document.createElement("h3");
    h3.textContent = titre;

    section.appendChild(h3);

    contenu.forEach(texte => {
      const p = document.createElement("p");
      p.textContent = texte;
      section.appendChild(p);
    });

    body.appendChild(section);
  }

  ajouterSection("Informations de la commande", [
    `N° d'ordre : ${numeroOrdre(commande)}`,
    `Référence : ${numero}`,
    `Date : ${formaterDate(commande.created_at)}`,
    `Statut : ${statuts[commande.statut] || commande.statut || "—"}`
  ]);

  ajouterSection("Informations du client", [
    `Nom : ${commande.nom_client || "—"}`,
    `Téléphone : ${commande.telephone || "—"}`,
    `E-mail : ${commande.email || "Non renseigné"}`
  ]);

  ajouterSection("Livraison", [
    `Adresse : ${commande.adresse_livraison || commande.adresse || "—"}`,
    `Ville : ${commande.ville || "—"}`,
    `Instructions : ${commande.instructions_livraison || "Aucune"}`
  ]);

  ajouterSection("Paiement", [
    `Mode : ${moyensPaiement[commande.mode_paiement] || commande.mode_paiement || "—"}`,
    `Statut du paiement : ${commande.statut_paiement || "—"}`
  ]);

  const sectionArticles = document.createElement("section");
  sectionArticles.className = "detail-section";

  const titreArticles = document.createElement("h3");
  titreArticles.textContent = "Articles commandés";
  sectionArticles.appendChild(titreArticles);

  const table = document.createElement("table");
  table.className = "detail-table";

  const thead = document.createElement("thead");
  const ligneEntete = document.createElement("tr");

  ["Produit", "Prix unitaire", "Quantité", "Sous-total"].forEach(titre => {
    const th = document.createElement("th");
    th.textContent = titre;
    ligneEntete.appendChild(th);
  });

  thead.appendChild(ligneEntete);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  (commande.commande_articles || []).forEach(article => {
    const tr = document.createElement("tr");

    [
      article.nom_produit,
      formaterMontant(article.prix_unitaire),
      article.quantite,
      formaterMontant(article.sous_total)
    ].forEach(valeur => {
      const td = document.createElement("td");
      td.textContent = valeur ?? "—";
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  sectionArticles.appendChild(table);
  body.appendChild(sectionArticles);

  ajouterSection("Récapitulatif", [
    `Sous-total : ${formaterMontant(commande.sous_total)}`,
    `Frais de livraison : ${formaterMontant(commande.frais_livraison)}`
  ]);

  const total = document.createElement("p");
  total.className = "commande-total";
  total.textContent = `Total : ${formaterMontant(commande.montant_total)}`;
  body.appendChild(total);

  modal.style.display = "flex";
}

// Affichage des commandes
function afficherCommandes(commandes) {
  ordersTableBody.replaceChildren();

  if (commandes.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");

    cell.colSpan = 7;
    cell.textContent =
      "Aucune commande ne correspond à votre recherche.";

    row.appendChild(cell);
    ordersTableBody.appendChild(row);

    return;
  }

  commandes.forEach(commande => {
    const row = document.createElement("tr");

    // Numéro
    const numeroCell = document.createElement("td");

    const numeroOrdreTexte = document.createElement("strong");
    numeroOrdreTexte.textContent = `N° ${numeroOrdre(commande)}`;

    const reference = document.createElement("small");
    reference.className = "order-ref";
    reference.textContent = commande.numero_commande || "";

    numeroCell.append(numeroOrdreTexte, reference);
    row.appendChild(numeroCell);

    // Client
    const clientCell = document.createElement("td");

    const nom = document.createElement("strong");
    nom.textContent = commande.nom_client || "Client";

    const telephone = document.createElement("small");
    telephone.className = "order-phone";
    telephone.textContent =
      commande.telephone || "Téléphone non renseigné";

    clientCell.append(nom, telephone);
    row.appendChild(clientCell);

    // Date et montant
    row.appendChild(creerCellule(formaterDate(commande.created_at)));

    row.appendChild(
      creerCellule(formaterMontant(commande.montant_total))
    );

    // Paiement
    row.appendChild(
      creerCellule(
        moyensPaiement[commande.mode_paiement] ||
        commande.mode_paiement ||
        "—"
      )
    );

    // Statut
    const statusCell = document.createElement("td");

    statusCell.appendChild(creerSelectStatut(commande));

    row.appendChild(statusCell);

    // Articles
    
// Articles et bouton de consultation
    const articlesCell = document.createElement("td");
    articlesCell.appendChild(creerDetailsArticles(commande));
    const boutonDetails = document.createElement("button");
    boutonDetails.type = "button";
    boutonDetails.className = "btn-details";
    boutonDetails.textContent = "Voir les détails";

    boutonDetails.addEventListener("click", () => {
      afficherDetailsCommande(commande);
    });

    articlesCell.appendChild(boutonDetails);
    row.appendChild(articlesCell);

    ordersTableBody.appendChild(row);
  });
}

// Recherche et filtres
function filtrerCommandes() {
  const recherche = searchInput.value.trim().toLowerCase();
  const statut = statusFilter.value;

  const resultat = toutesLesCommandes.filter(commande => {

    const correspondStatut =
      statut === "tous" || commande.statut === statut;

    const texte = [
      numeroOrdre(commande),
      commande.numero_commande,
      commande.nom_client,
      commande.telephone,
      commande.adresse
    ].join(" ").toLowerCase();

    return correspondStatut && texte.includes(recherche);
  });

  afficherCommandes(resultat);
}

// Chargement des commandes depuis Supabase
async function chargerCommandes() {
  ordersMessage.textContent = "Chargement des commandes...";

  refreshButton.disabled = true;

  try {
    const { data, error } = await db
      .from("commandes")
      
  .select(`
    id,
    numero,
    numero_commande,
    nom_client,
    telephone,
    email,
    adresse,
    adresse_livraison,
    ville,
    instructions_livraison,
    mode_paiement,
    statut,
    statut_paiement,
    sous_total,
    frais_livraison,
    montant_total,
    devise,
    created_at,
    commande_articles(
      nom_produit,
      prix_unitaire,
      quantite,
      sous_total
    )
  `)

      .order("created_at", { ascending: false });

    if (error) throw error;

    toutesLesCommandes = data || [];

    calculerNumerosAffiches();

    filtrerCommandes();

    ordersMessage.textContent =
      `${toutesLesCommandes.length} commande(s) enregistrée(s).`;

  } catch (error) {
    console.error("Erreur chargement commandes :", error);

    ordersMessage.textContent =
      error.message ||
      "Impossible de charger les commandes. Vérifie les autorisations Supabase.";

    ordersTableBody.replaceChildren();

  } finally {
    refreshButton.disabled = false;
  }
}

// Événements
searchInput.addEventListener("input", filtrerCommandes);

statusFilter.addEventListener("change", filtrerCommandes);

refreshButton.addEventListener("click", chargerCommandes);

// Déconnexion
document
  .getElementById("logout-button")
  .addEventListener("click", async () => {

    const { error } = await db.auth.signOut();

    if (error) {
      ordersMessage.textContent = "La déconnexion a échoué.";
      return;
    }

    window.location.replace("connexion.html");
  });

// Démarrage
async function demarrerGestionCommandes() {
  const autorise = await verifierAccesAdmin();

  if (autorise) {
    await chargerCommandes();
  }
}

demarrerGestionCommandes();