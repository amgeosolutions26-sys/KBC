const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const loginButton = document.getElementById("login-button");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  loginMessage.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Connexion...";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("nom, role")
      .eq("id", data.user.id)
      .single();

    if (profileError) throw profileError;

    if (!["admin", "gestionnaire"].includes(profile.role)) {
      await db.auth.signOut();
      throw new Error("Ce compte n'a pas accès à l'administration.");
    }

    window.location.href = "dashboard.html";

  } catch (error) {
    loginMessage.textContent =
      error.message || "Une erreur est survenue pendant la connexion.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Se connecter";
  }
});