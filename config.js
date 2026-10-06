// Twin SMP – Bewerbungsseite: Verbindung zu Supabase.
// Leer lassen = Demo-Modus (alles nur im eigenen Browser gespeichert, Admin-Passwort "demo").
// Der "anon"/"publishable" Key ist absichtlich öffentlich – geschützt wird über die Regeln in supabase/schema.sql.
window.TWIN_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
  adminEmail: "",          // E-Mail des Admin-Kontos in Supabase (auf der Seite wird nur das Passwort abgefragt)
  serverAddress: "stamina-smc.tun.ply.gg",
};
