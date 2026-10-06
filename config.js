// Twin SMP – Bewerbungsseite: Verbindung zu Supabase.
// Leer lassen = Demo-Modus (alles nur im eigenen Browser gespeichert, Admin-Passwort "demo").
// Der "anon"/"publishable" Key ist absichtlich öffentlich – geschützt wird über die Regeln in supabase/schema.sql.
window.TWIN_CONFIG = {
  // Discord-Webhook: Bewerbungen landen als Nachricht in deinem Discord-Kanal (kein Chat auf der Seite).
  discordWebhook: "",
  // Optional statt Discord: Supabase (Chat + Admin-Bereich auf der Seite), siehe README.
  supabaseUrl: "",
  supabaseAnonKey: "",
  adminEmail: "",          // E-Mail des Admin-Kontos in Supabase (auf der Seite wird nur das Passwort abgefragt)
  serverAddress: "stamina-smc.tun.ply.gg",
};
