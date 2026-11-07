import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, query, where, orderBy, onSnapshot, deleteDoc, setDoc, getDoc, doc, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, COLECCION } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
let unsub = null;

const msg = (t) => { $("msg").textContent = t || ""; };
const pad = (n) => String(n).padStart(2, "0");
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
// Mismo formato de id que usa n8n: yyyyMMdd'T'HHmm en UTC. Si la hora ya existe, la escritura se rechaza.
const docId = (d) => d.toISOString().slice(0, 16).replace(/[-:]/g, "");

function mover(dias) {
  const [y, m, d] = $("dia").value.split("-").map(Number);
  const f = new Date(y, m - 1, d + dias);
  $("dia").value = `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`;
  cargar();
}

function cargar() {
  if (unsub) unsub();
  const [y, m, d] = $("dia").value.split("-").map(Number);
  const ini = new Date(y, m - 1, d, 0, 0, 0);
  const fin = new Date(y, m - 1, d + 1, 0, 0, 0);
  const q = query(collection(db, COLECCION), where("inicio", ">=", Timestamp.fromDate(ini)), where("inicio", "<", Timestamp.fromDate(fin)), orderBy("inicio"));
  unsub = onSnapshot(q, (snap) => {
    const lista = $("lista");
    lista.replaceChildren();
    if (snap.empty) { const p = document.createElement("p"); p.className = "meta"; p.textContent = "Sin reservas este día."; lista.append(p); return; }
    snap.forEach((s) => {
      const r = s.data();
      const card = document.createElement("div"); card.className = "card row";
      const hora = document.createElement("div"); hora.className = "hora";
      hora.textContent = r.inicio.toDate().toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit", hour12: false });
      const info = document.createElement("div"); info.className = "grow";
      const n = document.createElement("div"); n.textContent = r.nombre || "Sin nombre";
      const meta = document.createElement("div"); meta.className = "meta";
      meta.textContent = [r.servicio, r.telefono ? "+" + r.telefono : ""].filter(Boolean).join(" · ");
      info.append(n, meta);
      const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = r.origen || "";
      const b = document.createElement("button"); b.className = "danger"; b.textContent = "Cancelar";
      b.onclick = async () => {
        if (!confirm(`¿Cancelar la reserva de las ${hora.textContent}?`)) return;
        try { await deleteDoc(doc(db, COLECCION, s.id)); } catch (e) { msg("No se pudo cancelar: " + e.code); }
      };
      card.append(hora, info, tag, b);
      lista.append(card);
    });
  }, (e) => msg("Error al leer: " + e.code));
}

$("loginForm").onsubmit = async (e) => {
  e.preventDefault(); msg("");
  try { await signInWithEmailAndPassword(auth, $("email").value, $("pass").value); }
  catch (err) { msg("Correo o contraseña incorrectos."); }
};
$("salir").onclick = () => signOut(auth);
$("ayer").onclick = () => mover(-1);
$("manana").onclick = () => mover(1);
$("dia").onchange = cargar;
$("bloqueo").onsubmit = async (e) => {
  e.preventDefault(); msg("");
  const [y, m, d] = $("dia").value.split("-").map(Number);
  const [h, mi] = $("bloqueoHora").value.split(":").map(Number);
  const ini = new Date(y, m - 1, d, h, mi);
  const fin = new Date(ini.getTime() + 30 * 60000);
  try {
    // No pisar una reserva que ya exista en esa hora.
    const ref = doc(db, COLECCION, docId(ini));
    if ((await getDoc(ref)).exists()) { msg("Esa hora ya está ocupada. Cancélala primero si quieres bloquearla."); return; }
    await setDoc(ref, {
      nombre: "BLOQUEADO", telefono: "", servicio: "", inicio: Timestamp.fromDate(ini), fin: Timestamp.fromDate(fin),
      estado: "bloqueada", origen: "panel", creada: Timestamp.now(),
    });
  } catch (err) { msg("No se pudo bloquear: " + err.code); }
};

onAuthStateChanged(auth, (u) => {
  $("login").hidden = !!u; $("app").hidden = !u;
  if (u) { if (!$("dia").value) $("dia").value = hoy(); cargar(); } else if (unsub) { unsub(); unsub = null; }
});
