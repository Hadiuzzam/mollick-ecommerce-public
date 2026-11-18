import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { readStore, saveOrderDraft } from "./firebase";
import "./styles.css";

const copy = {
  bn: {
    home: "হোম",
    products: "প্রোডাক্ট",
    contact: "যোগাযোগ",
    search: "খুঁজুন",
    heroCta: "শপ করুন",
    categories: "সব ক্যাটাগরি",
    allProducts: "সব প্রোডাক্ট",
    add: "কার্টে যোগ",
    buy: "এখনই কিনুন",
    details: "ডিটেইলস",
    cart: "কার্ট",
    empty: "আপনার কার্ট খালি",
    checkout: "অর্ডার করুন",
    name: "আপনার নাম",
    phone: "ফোন নাম্বার",
    address: "সম্পূর্ণ ঠিকানা",
    note: "কাস্টমার নোট",
    shipping: "ডেলিভারি চার্জ",
    total: "মোট",
    cod: "ক্যাশ অন ডেলিভারি",
    place: "Place Order",
    orderSuccess: "অর্ডার সফলভাবে জমা হয়েছে।",
    failure: "অর্ডার জমা হয়নি। Realtime Database Rules যাচাই করে আবার চেষ্টা করুন।",
    saving: "অর্ডার জমা হচ্ছে...",
  },
  en: {
    home: "Home",
    products: "Products",
    contact: "Contact",
    search: "Search",
    heroCta: "Shop now",
    categories: "All Categories",
    allProducts: "All Products",
    add: "Add to Cart",
    buy: "Buy Now",
    details: "Details",
    cart: "Cart",
    empty: "Your cart is empty",
    checkout: "Checkout",
    name: "Your name",
    phone: "Phone number",
    address: "Full address",
    note: "Customer note",
    shipping: "Delivery charge",
    total: "Total",
    cod: "Cash on Delivery",
    place: "Place Order",
    orderSuccess: "Order placed successfully.",
    failure: "Order was not placed. Check Realtime Database Rules, then try again.",
    saving: "Placing order...",
  },
};

const currency = (value) => `${value.toLocaleString("bn-BD")}৳`;
const pagesPreview = import.meta.env.PROD && import.meta.env.BASE_URL === "/mollick-ecommerce-public/";

function App() {
  const [lang, setLang] = useState("bn");
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [cart, setCart] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [orderError, setOrderError] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [shopData, setShopData] = useState({ settings: null, products: [], categories: [] });
  const [shopLoading, setShopLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const t = copy[lang];
  const settings = shopData.settings || {};
  const products = shopData?.products || [];
  const categories = shopData?.categories || [];

  useEffect(() => { document.title = `${settings.nameEn || settings.nameBn || "Online Store"} | Online Store`; }, [settings.nameEn, settings.nameBn]);

  useEffect(() => {
    let active = true;
    const refresh = () => readStore().then((data) => {
      if (!active) return;
      const nextProducts = Object.entries(data.products || {}).map(([id, item]) => ({ id, ...item }))
        .filter((item) => item.active !== false);
      const nextCategories = Object.entries(data.categories || {}).map(([id, item]) => ({ id, ...item }));
      setShopData({ settings: data.settings, products: nextProducts, categories: nextCategories });
      setActiveCat((current) => current === "all" || nextCategories.some((cat) => cat.id === current) ? current : "all");
      setCart((current) => current.flatMap((item) => {
        const latest = nextProducts.find((product) => product.id === item.id && product.available !== false);
        return latest ? [{ ...latest, qty: item.qty }] : [];
      }));
      setLoadError(false);
    }).catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setShopLoading(false); });
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    return products.filter((item) => {
      const matchesCat = activeCat === "all" || item.category === activeCat;
      const label = `${item.bn} ${item.en}`.toLowerCase();
      return matchesCat && label.includes(query.toLowerCase());
    });
  }, [activeCat, query, products]);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shipping = cart.length ? Number(settings.deliveryCharge || 0) : 0;
  const total = subtotal + shipping;

  const addToCart = (product, open = false) => {
    if (product.available === false) return;
    setCart((items) => {
      const found = items.find((item) => item.id === product.id);
      if (found) {
        return items.map((item) =>
          item.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...items, { ...product, qty: 1 }];
    });
    if (open) setDrawerOpen(true);
  };

  const updateQty = (id, change) => {
    setCart((items) =>
      items
        .map((item) => (item.id === id ? { ...item, qty: Math.max(0, item.qty + change) } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const placeOrder = async (event) => {
    event.preventDefault();
    if (pagesPreview || placingOrder || !cart.length) return;
    const orderForm = event.currentTarget;
    setPlacingOrder(true);
    setMessage("");
    setOrderError(false);
    const form = new FormData(orderForm);
    const order = {
      name: form.get("name"),
      phone: form.get("phone"),
      address: form.get("address"),
      note: form.get("note"),
      items: cart.map(({ id, bn, en, price, qty }) => ({ id, bn, en, price, qty })),
      subtotal,
      shipping,
      total,
      paymentMethod: "cash_on_delivery",
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    try {
      const result = await saveOrderDraft(order);
      setMessage(`${t.orderSuccess} #${result.name}`);
      setCart([]);
      orderForm.reset();
    } catch (error) {
      console.error("Order save failed:", error);
      setOrderError(true);
      setMessage(t.failure);
    } finally {
      setPlacingOrder(false);
    }
  };

  if (!shopLoading && settings.active === false) {
    return <main className="shop-unavailable"><h1>Shop unavailable</h1><p>এই দোকানটি এখন পাওয়া যাচ্ছে না।</p></main>;
  }
  if (shopLoading) return <main className="shop-unavailable">Loading shop...</main>;

  return (
    <div className="storefront" style={{ "--brand-primary": settings.primaryColor || "#34423b", "--brand-accent": settings.accentColor || "#a9b6ae" }}>
      <header className="topbar">
        <a className="brand" href="#home" aria-label={settings.nameEn || settings.nameBn || t.home}>
          {(settings.logoUrl || settings.nameEn || settings.nameBn) && <span className="brand-mark">{settings.logoUrl ? <img src={settings.logoUrl} alt="" /> : (settings.nameEn || settings.nameBn).slice(0, 2).toUpperCase()}</span>}
          <span>
            <strong>{lang === "bn" ? (settings.nameBn || settings.nameEn) : (settings.nameEn || settings.nameBn)}</strong>
            <small>{t.cod}</small>
          </span>
        </a>
        <nav>
          <a href="#home">{t.home}</a>
          <a href="#products">{t.products}</a>
          <a href="#contact">{t.contact}</a>
        </nav>
        <div className="actions">
          <label className="search">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.search}
            />
          </label>
          <button className="lang" onClick={() => setLang(lang === "bn" ? "en" : "bn")}>
            {lang === "bn" ? "EN" : "BN"}
          </button>
          <button className="cart-button" onClick={() => setDrawerOpen(true)} aria-label={t.cart}>
            ◴ <b>{cart.reduce((sum, item) => sum + item.qty, 0)}</b>
          </button>
        </div>
      </header>

      <main id="home">
        {loadError && <p className="store-notice" role="status">Store data could not be refreshed. Please try again.</p>}
        {(settings.promoBadge || settings.heroTitleBn || settings.heroTitleEn || settings.nameBn || settings.nameEn || settings.taglineBn || settings.taglineEn || settings.heroImageUrl) && <section className={`hero ${settings.heroImageUrl ? "" : "hero-text-only"}`}>
          <div className="hero-copy">
            {settings.promoBadge && <p className="eyebrow">{settings.promoBadge}</p>}
            {(settings.heroTitleBn || settings.heroTitleEn || settings.nameBn || settings.nameEn) && <h1>{lang === "bn" ? (settings.heroTitleBn || settings.nameBn || settings.heroTitleEn || settings.nameEn) : (settings.heroTitleEn || settings.nameEn || settings.heroTitleBn || settings.nameBn)}</h1>}
            {(settings.taglineBn || settings.taglineEn) && <p>{lang === "bn" ? (settings.taglineBn || settings.taglineEn) : (settings.taglineEn || settings.taglineBn)}</p>}
            <a className="primary" href="#products">{t.heroCta}</a>
          </div>
          {settings.heroImageUrl && <div className="hero-art"><img className="hero-photo" src={settings.heroImageUrl} alt="" /></div>}
        </section>}

        {categories.length > 0 && <section className="section">
          <div className="section-title">
            <h2>{t.categories}</h2>
          </div>
          <div className="categories">
            <button
              className={activeCat === "all" ? "active" : ""}
              onClick={() => setActiveCat("all")}
            >
              {lang === "bn" ? "সব" : "All"}
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={activeCat === cat.id ? "active" : ""}
                style={{ "--tone": cat.tone || "#eef1ee" }}
                onClick={() => setActiveCat(cat.id)}
              >
                <span></span>
                {cat[lang] || cat.bn || cat.en}
              </button>
            ))}
          </div>
        </section>}

        <section className="section" id="products">
          <div className="section-title">
            <h2>{t.allProducts}</h2>
            <p>{filtered.length} items</p>
          </div>
          {products.length === 0 && <p>{lang === "bn" ? "এখনো কোনো পণ্য যোগ করা হয়নি।" : "No products have been added yet."}</p>}
          <div className="grid">
            {filtered.map((product) => (
              <article className="product" key={product.id}>
                <div className="product-image">
                  {product.imageUrl && <img src={product.imageUrl} alt={product[lang] || product.bn || product.en} loading="lazy" />}
                </div>
                <div className="product-body">
                  <h3>{product[lang] || product.bn || product.en}</h3>
                  {product[`description${lang === "bn" ? "Bn" : "En"}`] && <p className="product-description">{product[`description${lang === "bn" ? "Bn" : "En"}`]}</p>}
                  <p>{currency(product.price)}</p>
                  {product.available === false && <small>{lang === "bn" ? "স্টক নেই" : "Out of stock"}</small>}
                  <div className="product-actions">
                    <button disabled={product.available === false} onClick={() => addToCart(product)}>{t.add}</button>
                    <button className="buy" disabled={product.available === false} onClick={() => addToCart(product, true)}>{t.buy}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="checkout section" id="checkout">
          <form onSubmit={placeOrder}>
            <div>
              <p className="eyebrow">{t.cod}</p>
              <h2>{t.checkout}</h2>
            </div>
            <input name="name" required minLength={2} placeholder={t.name} />
            <input name="phone" required pattern="(?:\+?880|0)1[3-9][0-9]{8}" title={lang === "bn" ? "সঠিক বাংলাদেশি মোবাইল নম্বর দিন" : "Enter a valid Bangladeshi mobile number"} placeholder={t.phone} inputMode="tel" />
            <textarea name="address" required minLength={5} placeholder={t.address}></textarea>
            <textarea name="note" placeholder={t.note}></textarea>
            <button className="primary" disabled={pagesPreview || !cart.length || placingOrder}>
              {placingOrder ? t.saving : `${t.place} ${currency(total)}`}
            </button>
            {pagesPreview && <p role="status">Orders are unavailable in this preview.</p>}
            {message && <p className={orderError ? "error" : "success"} role="status">{message}</p>}
          </form>
          <aside className="summary">
            <h2>{t.cart}</h2>
            {cart.length === 0 && <p>{t.empty}</p>}
            {cart.map((item) => (
              <div className="summary-row" key={item.id}>
                <span>{item[lang]}</span>
                <div>
                  <button onClick={() => updateQty(item.id, -1)}>-</button>
                  <b>{item.qty}</b>
                  <button onClick={() => updateQty(item.id, 1)}>+</button>
                </div>
                <strong>{currency(item.price * item.qty)}</strong>
              </div>
            ))}
            <div className="total-line"><span>{t.shipping}</span><b>{currency(shipping)}</b></div>
            <div className="total-line grand"><span>{t.total}</span><b>{currency(total)}</b></div>
          </aside>
        </section>
      </main>

      <footer id="contact">
        <div>
          <strong>{lang === "bn" ? (settings.nameBn || settings.nameEn) : (settings.nameEn || settings.nameBn)}</strong>
          {(settings.taglineBn || settings.taglineEn) && <p>{lang === "bn" ? (settings.taglineBn || settings.taglineEn) : (settings.taglineEn || settings.taglineBn)}</p>}
        </div>
        <div>
          {settings.whatsapp && <p>WhatsApp: {settings.whatsapp}</p>}
          {settings.email && <p>Email: {settings.email}</p>}
        </div>
      </footer>

      <div className={`drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <button className="close" onClick={() => setDrawerOpen(false)}>×</button>
        <h2>{t.cart}</h2>
        {cart.length === 0 && <p>{t.empty}</p>}
        {cart.map((item) => (
          <div className="drawer-item" key={item.id}>
            <span>{item[lang]}</span>
            <small>{item.qty} × {currency(item.price)}</small>
          </div>
        ))}
        <a className="primary" href="#checkout" onClick={() => setDrawerOpen(false)}>
          {t.checkout} {currency(total)}
        </a>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
