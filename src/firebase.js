const useEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";
const databaseURL = useEmulator
  ? "http://127.0.0.1:9000"
  : import.meta.env.VITE_FIREBASE_DATABASE_URL?.replace(/\/$/, "");

function urlFor(path) {
  const url = new URL(`${databaseURL}/clientDemo/${path}.json`);
  if (useEmulator) url.searchParams.set("ns", `${import.meta.env.VITE_FIREBASE_PROJECT_ID}-default-rtdb`);
  return url;
}

async function read(path) {
  if (!databaseURL) throw new Error("Firebase database URL is missing");
  const response = await fetch(urlFor(path), { cache: "no-store" });
  if (!response.ok) throw new Error(`Firebase read failed (${response.status})`);
  return response.json();
}

export async function readStore() {
  const [settings, products, categories] = await Promise.all([
    read("settings"), read("products"), read("categories"),
  ]);
  return { settings, products, categories };
}

export async function saveOrderDraft(order) {
  if (!databaseURL) throw new Error("Firebase database URL is missing");
  const response = await fetch(urlFor("orders"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(order),
  });
  if (!response.ok) throw new Error(`Order save failed (${response.status})`);
  return response.json();
}
