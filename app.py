import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import (Flask, abort, flash, g, jsonify, redirect, render_template,
                   request, send_file, send_from_directory, session, url_for)
from markupsafe import Markup
from PIL import Image, ImageOps
from werkzeug.security import check_password_hash, generate_password_hash

BASE = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get("DB_PATH", os.path.join(BASE, "amazu.db"))
UPLOAD = os.environ.get("UPLOAD_DIR", os.path.join(BASE, "uploads"))
ALLOWED = {"png", "jpg", "jpeg", "webp", "gif"}
CHAT_DIR = os.environ.get("CHAT_DIR", os.path.join(BASE, "chat_files"))  # ntibigaragara ku bantu bose
os.makedirs(CHAT_DIR, exist_ok=True)
MAX_PHOTOS = 8
KIGALI_TZ = timezone(timedelta(hours=2))

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@amazu.rw")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@12345")

CITIES = ["Kigali", "Huye", "Musanze", "Rubavu", "Rusizi", "Muhanga",
          "Nyagatare", "Rwamagana", "Karongi", "Nyamagabe", "Kayonza"]

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "hindura-iyi-key-mbere-yo-gushyira-kuri-server")
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('renter','owner','admin')),
  active INTEGER NOT NULL DEFAULT 1,
  avatar TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cities(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS listings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  price INTEGER NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 1,
  description TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available','rented')),
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS photos(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  filename TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  renter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE(listing_id, renter_id)
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
"""


def now():
    return datetime.now(KIGALI_TZ).strftime("%Y-%m-%d %H:%M")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(_=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# Ongeraho inkingi nshya ku bubiko busanzweho (nta makuru yatakara)
MIGRATIONS = [
    ("users", "avatar", "TEXT", None),
    ("listings", "lat", "REAL", None),
    ("listings", "lng", "REAL", None),
    ("messages", "is_read", "INTEGER NOT NULL DEFAULT 0", "UPDATE messages SET is_read=1"),
    ("messages", "kind", "TEXT", None),
    ("messages", "att", "TEXT", None),
    ("messages", "att_name", "TEXT", None),
    ("messages", "att_mime", "TEXT", None),
    ("messages", "att_size", "INTEGER", None),
    ("messages", "att_dur", "INTEGER", None),
]


def migrate(db):
    for table, col, ddl, after in MIGRATIONS:
        cols = [r[1] for r in db.execute(f"PRAGMA table_info({table})")]
        if col not in cols:
            db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
            if after:
                db.execute(after)
    db.execute("CREATE INDEX IF NOT EXISTS idx_msg_unread ON messages(conversation_id, is_read)")


def init_db():
    os.makedirs(UPLOAD, exist_ok=True)
    db = sqlite3.connect(DB)
    db.execute("PRAGMA foreign_keys=ON")
    db.executescript(SCHEMA)
    migrate(db)
    if db.execute("SELECT COUNT(*) FROM cities").fetchone()[0] == 0:
        db.executemany("INSERT INTO cities(name) VALUES(?)", [(c,) for c in CITIES])
    if not db.execute("SELECT 1 FROM users WHERE role='admin'").fetchone():
        db.execute(
            "INSERT INTO users(name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
            ("Admin", ADMIN_EMAIL, "-", generate_password_hash(ADMIN_PASSWORD), "admin", now()))
    db.commit()
    db.close()


# ---------- CSRF + current user ----------
def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


app.jinja_env.globals["csrf_token"] = csrf_token
app.jinja_env.filters["rwf"] = lambda v: f"{int(v):,} RWF".replace(",", " ")
app.jinja_env.filters["initials"] = lambda n: ((n or "?").strip()[:1] or "?").upper()

ICONS = {
    "pin": '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    "bed": '<path d="M3 19V6M3 15h18v4M21 15v-2.5A3.5 3.5 0 0 0 17.5 9H11v6"/><circle cx="7" cy="11.5" r="1.7"/>',
    "phone": '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    "chat": '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
    "search": '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "back": '<path d="M15 6l-6 6 6 6"/>',
    "check": '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    "image": '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
    "send": '<path d="M4 12 20 4l-5 16-3-7z"/>',
    "edit": '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    "home": '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    "moon": '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    "lock": '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    "map": '<path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v14M15 6.5v14"/>',
    "locate": '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
    "logout": '<path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4"/><path d="M16 8l4 4-4 4M20 12H9"/>',
    "mic": '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    "clip": '<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15 7"/>',
    "file": '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    "download": '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    "stop": '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    "trash": '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    "volume": '<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    "mute": '<path d="M4 9v6h4l5 4V5L8 9zM17 9l5 6M22 9l-5 6"/>',
    "expand": '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    "play": '<path d="M7 4.5v15l13-7.5z"/>',
    "pause": '<path d="M8 5v14M16 5v14"/>',
    "x": '<path d="M6 6l12 12M18 6 6 18"/>',
    "layers": '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    "camera": '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
}


def icon(name, size=18):
    return Markup(f'<svg class="ico" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
                  f'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" '
                  f'aria-hidden="true">{ICONS[name]}</svg>')


app.jinja_env.globals["icon"] = icon


@app.before_request
def load_user():
    g.user = None
    uid = session.get("uid")
    if uid:
        u = get_db().execute("SELECT * FROM users WHERE id=? AND active=1", (uid,)).fetchone()
        if u:
            g.user = u
        else:
            session.pop("uid", None)
    if request.method == "POST":
        tok = request.form.get("csrf_token") or request.headers.get("X-CSRF-Token") or ""
        if not secrets.compare_digest(tok, session.get("csrf", "")):
            abort(400, "CSRF token itari yo. Subira ugerageze.")


def unread_count(uid):
    return get_db().execute(
        """SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id=m.conversation_id
           WHERE m.is_read=0 AND m.sender_id!=? AND (c.renter_id=? OR c.owner_id=?)""",
        (uid, uid, uid)).fetchone()[0]


@app.context_processor
def inject():
    u = g.get("user")
    return {"me": u, "unread": unread_count(u["id"]) if u and u["role"] != "admin" else 0}


def safe_next(v):
    """Emera gusa inzira zo muri uru rubuga (irinda redirect ku yindi site)."""
    if not v or not v.startswith("/") or v.startswith("//") or "\\" in v or "\n" in v or "\r" in v:
        return None
    return v


def default_home(u):
    return url_for({"admin": "admin", "owner": "owner_dashboard"}.get(u["role"], "index"))


def welcome_redirect(nxt=None):
    nxt = safe_next(nxt)
    return redirect(url_for("welcome", to=nxt) if nxt else url_for("welcome"))


def login_required(f):
    @wraps(f)
    def w(*a, **k):
        if not g.user:
            flash("Banza winjire muri konti yawe.", "warn")
            return redirect(url_for("login", next=request.path))
        return f(*a, **k)
    return w


def role_required(*roles):
    def deco(f):
        @wraps(f)
        @login_required
        def w(*a, **k):
            if g.user["role"] not in roles:
                abort(403)
            return f(*a, **k)
        return w
    return deco


# ---------- Public ----------
@app.route("/")
def index():
    cities = get_db().execute("""
        SELECT c.id, c.name,
          (SELECT COUNT(*) FROM listings l JOIN users u ON u.id=l.owner_id
            WHERE l.city_id=c.id AND l.status='available' AND u.active=1) AS n
        FROM cities c ORDER BY n DESC, c.name""").fetchall()
    latest = get_db().execute(LISTING_SELECT + """
        WHERE l.status='available' AND u.active=1 ORDER BY l.id DESC LIMIT 6""").fetchall()
    total = sum(c["n"] for c in cities)
    return render_template("index.html", cities=cities, latest=latest, total=total)


@app.route("/go")
def go():
    cid = request.args.get("city", type=int)
    if not cid:
        return redirect(url_for("index"))
    args = {k: v for k, v in (("max_price", request.args.get("max_price", type=int)),
                              ("bedrooms", request.args.get("bedrooms", type=int))) if v}
    return redirect(url_for("city", cid=cid, **args))


LISTING_SELECT = """
SELECT l.*, c.name AS city_name, u.name AS owner_name, u.avatar AS owner_avatar,
  (SELECT filename FROM photos p WHERE p.listing_id=l.id ORDER BY p.id LIMIT 1) AS cover
FROM listings l JOIN cities c ON c.id=l.city_id JOIN users u ON u.id=l.owner_id
"""


@app.route("/city/<int:cid>")
def city(cid):
    db = get_db()
    c = db.execute("SELECT * FROM cities WHERE id=?", (cid,)).fetchone()
    if not c:
        abort(404)
    sql = LISTING_SELECT + " WHERE l.city_id=? AND l.status='available' AND u.active=1"
    args = [cid]
    max_price = request.args.get("max_price", type=int)
    beds = request.args.get("bedrooms", type=int)
    q = (request.args.get("q") or "").strip()
    if max_price:
        sql += " AND l.price<=?"
        args.append(max_price)
    if beds:
        sql += " AND l.bedrooms>=?"
        args.append(beds)
    if q:
        sql += " AND (l.location LIKE ? OR l.title LIKE ?)"
        args += [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY l.id DESC"
    items = db.execute(sql, args).fetchall()
    return render_template("city.html", city=c, items=items, max_price=max_price or "",
                           beds=beds or "", q=q)


@app.route("/listing/<int:lid>")
def listing(lid):
    if not g.user:
        flash("Injira cyangwa ufungure konti kugira ngo urebe amafoto yose, aho inzu iri na telefoni ya nyirinzu.", "warn")
        return redirect(url_for("login", next=url_for("listing", lid=lid)))
    db = get_db()
    l = db.execute(LISTING_SELECT + " WHERE l.id=?", (lid,)).fetchone()
    if not l:
        abort(404)
    owner = db.execute("SELECT active FROM users WHERE id=?", (l["owner_id"],)).fetchone()
    is_owner = g.user and (g.user["id"] == l["owner_id"] or g.user["role"] == "admin")
    if not owner["active"] and not is_owner:
        abort(404)
    photos = db.execute("SELECT * FROM photos WHERE listing_id=? ORDER BY id", (lid,)).fetchall()
    return render_template("listing.html", l=l, photos=photos)


@app.route("/uploads/<path:name>")
def uploads(name):
    if "/" in name or "\\" in name:
        abort(404)
    return send_from_directory(UPLOAD, name)


# ---------- Auth ----------
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        f = request.form
        name, email = f.get("name", "").strip(), f.get("email", "").strip().lower()
        phone, pw, role = f.get("phone", "").strip(), f.get("password", ""), f.get("role", "")
        err = None
        if not name or not phone:
            err = "Uzuza amazina na telefoni."
        elif not EMAIL_RE.match(email):
            err = "Email ntabwo ari yo."
        elif len(pw) < 6:
            err = "Ijambo ry'ibanga rigomba kuba nibura inyuguti 6."
        elif role not in ("renter", "owner"):
            err = "Hitamo ubwoko bwa konti."
        if err:
            flash(err, "error")
            return render_template("register.html", form=f), 400
        db = get_db()
        try:
            cur = db.execute(
                "INSERT INTO users(name,email,phone,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
                (name, email, phone, generate_password_hash(pw), role, now()))
            db.commit()
        except sqlite3.IntegrityError:
            flash("Iyi email isanzwe ikoreshwa.", "error")
            return render_template("register.html", form=f), 400
        session.clear()
        session["uid"] = cur.lastrowid
        flash("Konti yawe yafunguwe neza!", "ok")
        return welcome_redirect(request.args.get("next"))
    return render_template("register.html", form={})


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        u = get_db().execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        if u and check_password_hash(u["password_hash"], request.form.get("password", "")):
            if not u["active"]:
                flash("Iyi konti yahagaritswe. Vugana na admin.", "error")
                return render_template("login.html"), 403
            nxt = request.args.get("next")
            session.clear()
            session["uid"] = u["id"]
            return welcome_redirect(nxt)
        flash("Email cyangwa ijambo ry'ibanga si byo.", "error")
        return render_template("login.html"), 401
    return render_template("login.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/account", methods=["GET", "POST"])
@login_required
def account():
    if request.method == "POST":
        old, new = request.form.get("old", ""), request.form.get("new", "")
        if not check_password_hash(g.user["password_hash"], old):
            flash("Ijambo ry'ibanga risanzwe si ryo.", "error")
        elif len(new) < 6:
            flash("Ijambo rishya rigomba kuba nibura inyuguti 6.", "error")
        else:
            db = get_db()
            db.execute("UPDATE users SET password_hash=? WHERE id=?",
                       (generate_password_hash(new), g.user["id"]))
            db.commit()
            flash("Ijambo ry'ibanga ryahinduwe.", "ok")
        return redirect(url_for("account"))
    return render_template("account.html")


@app.route("/welcome")
@login_required
def welcome():
    dest = safe_next(request.args.get("to"))
    custom = bool(dest)
    dest = dest or default_home(g.user)
    labels = {"admin": "dashboard ya admin", "owner": "dashboard yawe"}
    label = "paji wasabye" if custom else labels.get(g.user["role"], "ahabanza")
    return render_template("welcome.html", dest=dest, label=label)


AVATAR_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}


def make_avatar(stream):
    """Fungura ifoto, ugenzure ko ari ifoto koko, uyigire kare 320x320 (JPEG)."""
    try:
        im = Image.open(stream)
        if im.format not in AVATAR_FORMATS:
            return None
        im = ImageOps.exif_transpose(im)
        if im.mode != "RGB":
            im = im.convert("RGBA")
            bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
            bg.alpha_composite(im)
            im = bg.convert("RGB")
        im = ImageOps.fit(im, (320, 320), Image.LANCZOS)
    except Exception:
        return None
    name = "av_" + uuid.uuid4().hex + ".jpg"
    im.save(os.path.join(UPLOAD, name), "JPEG", quality=86, optimize=True)
    return name


@app.route("/account/avatar", methods=["POST"])
@login_required
def avatar_upload():
    f = request.files.get("avatar")
    if not f or not f.filename:
        flash("Banza uhitemo ifoto.", "warn")
        return redirect(url_for("account"))
    name = make_avatar(f.stream)
    if not name:
        flash("Iyo foto ntishobora gukoreshwa. Koresha jpg, png cyangwa webp.", "error")
        return redirect(url_for("account"))
    db = get_db()
    old = g.user["avatar"]
    db.execute("UPDATE users SET avatar=? WHERE id=?", (name, g.user["id"]))
    db.commit()
    if old:
        remove_files([old])
    flash("Ifoto ya profile yahinduwe.", "ok")
    return redirect(url_for("account"))


@app.route("/account/avatar/remove", methods=["POST"])
@login_required
def avatar_remove():
    old = g.user["avatar"]
    if old:
        db = get_db()
        db.execute("UPDATE users SET avatar=NULL WHERE id=?", (g.user["id"],))
        db.commit()
        remove_files([old])
        flash("Ifoto ya profile yasibwe.", "ok")
    return redirect(url_for("account"))


# ---------- Owner ----------
def save_photos(db, lid, files):
    count = db.execute("SELECT COUNT(*) FROM photos WHERE listing_id=?", (lid,)).fetchone()[0]
    for f in files:
        if not f or not f.filename:
            continue
        ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else ""
        if ext not in ALLOWED:
            flash(f"{f.filename}: ubwoko bw'ifoto ntibwemewe (koresha jpg, png, webp).", "warn")
            continue
        if count >= MAX_PHOTOS:
            flash(f"Ushobora gushyiraho amafoto {MAX_PHOTOS} gusa kuri buri nzu.", "warn")
            break
        name = uuid.uuid4().hex + "." + ext
        f.save(os.path.join(UPLOAD, name))
        db.execute("INSERT INTO photos(listing_id,filename) VALUES(?,?)", (lid, name))
        count += 1


def parse_listing_form(f):
    try:
        data = dict(
            city_id=int(f.get("city_id", 0)),
            title=f.get("title", "").strip(),
            location=f.get("location", "").strip(),
            price=int(f.get("price", 0)),
            bedrooms=int(f.get("bedrooms", 1)),
            description=f.get("description", "").strip(),
            phone=f.get("phone", "").strip(),
        )
    except ValueError:
        return None, "Igiciro n'umubare w'ibyumba bigomba kuba imibare."
    if not (data["title"] and data["location"] and data["phone"]):
        return None, "Uzuza umutwe, aho iherereye na telefoni."
    if data["price"] <= 0 or data["bedrooms"] < 0:
        return None, "Igiciro kigomba kuba kirenze 0."
    lat = lng = None
    lat_s, lng_s = f.get("lat", "").strip(), f.get("lng", "").strip()
    if lat_s or lng_s:
        try:
            lat, lng = float(lat_s), float(lng_s)
        except ValueError:
            return None, "Aho inzu iri ku ikarita ntiheruye neza. Ongera uhitemo."
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return None, "Aho inzu iri ku ikarita ntiheruye neza. Ongera uhitemo."
    data["lat"], data["lng"] = lat, lng
    return data, None


def own_listing_or_404(lid):
    l = get_db().execute("SELECT * FROM listings WHERE id=?", (lid,)).fetchone()
    if not l:
        abort(404)
    if l["owner_id"] != g.user["id"] and g.user["role"] != "admin":
        abort(403)
    return l


@app.route("/owner")
@role_required("owner")
def owner_dashboard():
    items = get_db().execute(LISTING_SELECT + " WHERE l.owner_id=? ORDER BY l.id DESC",
                             (g.user["id"],)).fetchall()
    return render_template("owner.html", items=items)


@app.route("/owner/new", methods=["GET", "POST"])
@role_required("owner")
def listing_new():
    db = get_db()
    cities = db.execute("SELECT * FROM cities ORDER BY name").fetchall()
    if request.method == "POST":
        data, err = parse_listing_form(request.form)
        if err:
            flash(err, "error")
            return render_template("listing_form.html", cities=cities, form=request.form, l=None), 400
        cur = db.execute(
            """INSERT INTO listings(owner_id,city_id,title,location,price,bedrooms,description,phone,lat,lng,created_at)
               VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (g.user["id"], data["city_id"], data["title"], data["location"], data["price"],
             data["bedrooms"], data["description"], data["phone"], data["lat"], data["lng"], now()))
        save_photos(db, cur.lastrowid, request.files.getlist("photos"))
        db.commit()
        flash("Inzu yashyizweho neza!", "ok")
        return redirect(url_for("listing", lid=cur.lastrowid))
    return render_template("listing_form.html", cities=cities,
                           form={"phone": g.user["phone"], "bedrooms": 1}, l=None)


@app.route("/owner/<int:lid>/edit", methods=["GET", "POST"])
@login_required
def listing_edit(lid):
    l = own_listing_or_404(lid)
    db = get_db()
    cities = db.execute("SELECT * FROM cities ORDER BY name").fetchall()
    photos = db.execute("SELECT * FROM photos WHERE listing_id=? ORDER BY id", (lid,)).fetchall()
    if request.method == "POST":
        data, err = parse_listing_form(request.form)
        if err:
            flash(err, "error")
            return render_template("listing_form.html", cities=cities, form=request.form,
                                   l=l, photos=photos), 400
        db.execute("""UPDATE listings SET city_id=?,title=?,location=?,price=?,bedrooms=?,
                      description=?,phone=?,lat=?,lng=? WHERE id=?""",
                   (data["city_id"], data["title"], data["location"], data["price"],
                    data["bedrooms"], data["description"], data["phone"], data["lat"], data["lng"], lid))
        save_photos(db, lid, request.files.getlist("photos"))
        db.commit()
        flash("Impinduka zabitswe.", "ok")
        return redirect(url_for("listing", lid=lid))
    return render_template("listing_form.html", cities=cities, form=l, l=l, photos=photos)


@app.route("/owner/<int:lid>/status", methods=["POST"])
@login_required
def listing_status(lid):
    l = own_listing_or_404(lid)
    new = "rented" if l["status"] == "available" else "available"
    db = get_db()
    db.execute("UPDATE listings SET status=? WHERE id=?", (new, lid))
    db.commit()
    flash("Imiterere y'inzu yahindutse.", "ok")
    return redirect(request.referrer or url_for("owner_dashboard"))


def remove_files(names):
    for n in names:
        try:
            os.remove(os.path.join(UPLOAD, n))
        except OSError:
            pass


@app.route("/owner/<int:lid>/delete", methods=["POST"])
@login_required
def listing_delete(lid):
    own_listing_or_404(lid)
    db = get_db()
    names = [r["filename"] for r in db.execute("SELECT filename FROM photos WHERE listing_id=?", (lid,))]
    db.execute("DELETE FROM listings WHERE id=?", (lid,))
    db.commit()
    remove_files(names)
    flash("Inzu yasibwe.", "ok")
    return redirect(request.referrer if request.referrer and "/admin" in request.referrer
                    else url_for("owner_dashboard"))


@app.route("/owner/photo/<int:pid>/delete", methods=["POST"])
@login_required
def photo_delete(pid):
    db = get_db()
    p = db.execute("SELECT * FROM photos WHERE id=?", (pid,)).fetchone()
    if not p:
        abort(404)
    own_listing_or_404(p["listing_id"])
    db.execute("DELETE FROM photos WHERE id=?", (pid,))
    db.commit()
    remove_files([p["filename"]])
    return redirect(url_for("listing_edit", lid=p["listing_id"]))


# ---------- Chat ----------
def conv_or_404(cid):
    c = get_db().execute("SELECT * FROM conversations WHERE id=?", (cid,)).fetchone()
    if not c:
        abort(404)
    if g.user["id"] not in (c["renter_id"], c["owner_id"]):
        abort(403)
    return c


@app.route("/listing/<int:lid>/chat", methods=["POST"])
@login_required
def chat_start(lid):
    db = get_db()
    l = db.execute("SELECT * FROM listings WHERE id=?", (lid,)).fetchone()
    if not l:
        abort(404)
    if g.user["id"] == l["owner_id"]:
        flash("Iyi ni inzu yawe.", "warn")
        return redirect(url_for("listing", lid=lid))
    if g.user["role"] == "admin":
        abort(403)
    c = db.execute("SELECT id FROM conversations WHERE listing_id=? AND renter_id=?",
                   (lid, g.user["id"])).fetchone()
    if c:
        return redirect(url_for("chat", cid=c["id"]))
    cur = db.execute("INSERT INTO conversations(listing_id,renter_id,owner_id,created_at) VALUES(?,?,?,?)",
                     (lid, g.user["id"], l["owner_id"], now()))
    db.commit()
    return redirect(url_for("chat", cid=cur.lastrowid))


def mark_read(db, cid):
    db.execute("UPDATE messages SET is_read=1 WHERE conversation_id=? AND sender_id!=? AND is_read=0",
               (cid, g.user["id"]))
    db.commit()


@app.route("/chats")
@login_required
def chats():
    rows = get_db().execute("""
        SELECT c.id, l.title, l.id AS lid,
          CASE WHEN c.renter_id=:me THEN uo.name ELSE ur.name END AS other_name,
          CASE WHEN c.renter_id=:me THEN uo.avatar ELSE ur.avatar END AS other_avatar,
          (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id
             AND m.sender_id!=:me AND m.is_read=0) AS unread,
          (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
          (SELECT kind FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_kind,
          (SELECT created_at FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_at
        FROM conversations c
        JOIN listings l ON l.id=c.listing_id
        JOIN users ur ON ur.id=c.renter_id JOIN users uo ON uo.id=c.owner_id
        WHERE c.renter_id=:me OR c.owner_id=:me
        ORDER BY COALESCE(last_at, c.created_at) DESC""", {"me": g.user["id"]}).fetchall()
    return render_template("chats.html", rows=rows)


@app.route("/chat/<int:cid>")
@login_required
def chat(cid):
    c = conv_or_404(cid)
    db = get_db()
    l = db.execute("SELECT * FROM listings WHERE id=?", (c["listing_id"],)).fetchone()
    other_id = c["owner_id"] if g.user["id"] == c["renter_id"] else c["renter_id"]
    other = db.execute("SELECT name, avatar FROM users WHERE id=?", (other_id,)).fetchone()
    mark_read(db, cid)
    return render_template("chat.html", c=c, l=l, other=other)


# ---- Ibyoherezwa mu biganiro: ifoto, voice note, dosiye ----
LIMIT_IMG, LIMIT_AUDIO, LIMIT_FILE = 10 * 1024 * 1024, 6 * 1024 * 1024, 10 * 1024 * 1024
DOC_EXT = {"pdf": "application/pdf", "txt": "text/plain; charset=utf-8", "csv": "text/csv; charset=utf-8",
           "doc": "application/msword", "xls": "application/vnd.ms-excel", "ppt": "application/vnd.ms-powerpoint",
           "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
           "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
           "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}
KIND_LABEL = {"image": "Ifoto", "audio": "Ubutumwa bw'ijwi", "file": "Dosiye"}


class ChatUploadError(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.msg, self.status = msg, status


def sniff_audio(b):
    """Menya ubwoko bw'amajwi ukurikije ibiri mu mutwe wa dosiye, ntiwizere izina cyangwa 'content-type'."""
    if b[:4] == b"\x1a\x45\xdf\xa3":
        return "audio/webm", "webm"
    if b[:4] == b"OggS":
        return "audio/ogg", "ogg"
    if b[4:8] == b"ftyp":
        return "audio/mp4", "m4a"
    if b[:4] == b"RIFF" and b[8:12] == b"WAVE":
        return "audio/wav", "wav"
    if b[:3] == b"ID3" or (len(b) > 1 and b[0] == 0xFF and (b[1] & 0xE0) == 0xE0):
        return "audio/mpeg", "mp3"
    return None


def clean_image(data):
    """Emeza ko ari ifoto nyayo, ikureho amakuru yihishe (EXIF) uyigabanye. Garuka (bytes, mime, ext)."""
    from io import BytesIO
    Image.MAX_IMAGE_PIXELS = 40_000_000
    try:
        im = Image.open(BytesIO(data))
        fmt = im.format
        im.verify()
        im = Image.open(BytesIO(data))
        if fmt not in ("JPEG", "PNG", "WEBP", "GIF"):
            raise ChatUploadError("Ubwoko bw'ifoto ntibwemewe (koresha jpg, png, webp cyangwa gif).")
        if fmt == "GIF":
            if getattr(im, "n_frames", 1) > 1:
                return data, "image/gif", "gif"
        im = ImageOps.exif_transpose(im)
        im.thumbnail((2000, 2000))
        out = BytesIO()
        if im.mode in ("RGBA", "LA", "P") and fmt in ("PNG", "WEBP", "GIF"):
            im.convert("RGBA").save(out, "PNG", optimize=True)
            return out.getvalue(), "image/png", "png"
        im.convert("RGB").save(out, "JPEG", quality=86, optimize=True)
        return out.getvalue(), "image/jpeg", "jpg"
    except ChatUploadError:
        raise
    except Exception:
        raise ChatUploadError("Iyi si ifoto nyayo cyangwa irangiritse.")


def safe_display_name(name, fallback):
    name = os.path.basename((name or "").replace("\\", "/"))
    name = re.sub(r"[^\w.\- ()\[\]]+", "_", name, flags=re.UNICODE).strip(" .")[:80]
    return name or fallback


def store_chat_file(f):
    """Emeza kandi ubike dosiye yoherejwe. Garuka (kind, stored, display, mime, size)."""
    raw_name = f.filename or ""
    ext = raw_name.rsplit(".", 1)[-1].lower() if "." in raw_name else ""
    data = f.read(max(LIMIT_IMG, LIMIT_FILE, LIMIT_AUDIO) + 1)
    if not data:
        raise ChatUploadError("Dosiye irimo ubusa.")
    audio = sniff_audio(data[:16])
    is_img = data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n" or data[:6] in (b"GIF87a", b"GIF89a") \
        or (data[:4] == b"RIFF" and data[8:12] == b"WEBP")
    if is_img:
        if len(data) > LIMIT_IMG:
            raise ChatUploadError("Ifoto irenze 10 MB.", 413)
        data, mime, out_ext = clean_image(data)
        kind = "image"
        display = safe_display_name(raw_name, "ifoto." + out_ext)
        display = display.rsplit(".", 1)[0] + "." + out_ext
    elif audio:
        if len(data) > LIMIT_AUDIO:
            raise ChatUploadError("Ijwi ririmo ni rirerire cyane (hejuru ya 6 MB).", 413)
        mime, out_ext = audio
        kind = "audio"
        display = "ijwi." + out_ext
    else:
        if len(data) > LIMIT_FILE:
            raise ChatUploadError("Dosiye irenze 10 MB.", 413)
        if ext not in DOC_EXT:
            raise ChatUploadError("Ubwoko bwa dosiye ntibwemewe. Wemerewe: pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv.")
        head = data[:8]
        ok = ((ext == "pdf" and data[:5] == b"%PDF-") or
              (ext in ("docx", "xlsx", "pptx") and head[:2] == b"PK") or
              (ext in ("doc", "xls", "ppt") and head == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1") or
              (ext in ("txt", "csv") and b"\x00" not in data[:4096]))
        if not ok:
            raise ChatUploadError("Dosiye ntihuye n'ubwoko bwayo.")
        mime, kind, out_ext = DOC_EXT[ext], "file", ext
        display = safe_display_name(raw_name, "dosiye." + ext)
    stored = uuid.uuid4().hex + "." + out_ext
    with open(os.path.join(CHAT_DIR, stored), "wb") as fh:
        fh.write(data)
    return kind, stored, display, mime, len(data)


def msg_json(m):
    d = {"id": m["id"], "sender_id": m["sender_id"], "body": m["body"], "created_at": m["created_at"],
         "kind": m["kind"] or "text"}
    if m["att"]:
        d.update(url=url_for("chat_file", mid=m["id"]), name=m["att_name"], size=m["att_size"],
                 mime=m["att_mime"], dur=m["att_dur"])
    return d


@app.route("/api/chat/<int:cid>", methods=["GET", "POST"])
@login_required
def chat_api(cid):
    conv_or_404(cid)
    db = get_db()
    if request.method == "POST":
        if request.is_json:
            body = ((request.get_json(silent=True) or {}).get("body") or "").strip()
            f = None
        else:
            body = (request.form.get("body") or "").strip()
            f = request.files.get("file")
            if f is not None and not f.filename:
                f = None
        if not body and not f:
            return jsonify(error="empty", message="Andika ubutumwa cyangwa uhitemo dosiye."), 400
        kind = att = att_name = att_mime = att_size = att_dur = None
        if f:
            try:
                kind, att, att_name, att_mime, att_size = store_chat_file(f)
            except ChatUploadError as e:
                return jsonify(error="upload", message=e.msg), e.status
            if kind == "audio":
                att_dur = max(0, min(900, request.form.get("dur", 0, type=int) or 0))
        db.execute("""INSERT INTO messages(conversation_id,sender_id,body,created_at,kind,att,att_name,att_mime,att_size,att_dur)
                      VALUES(?,?,?,?,?,?,?,?,?,?)""",
                   (cid, g.user["id"], body[:2000], now(), kind, att, att_name, att_mime, att_size, att_dur))
        db.commit()
    mark_read(db, cid)
    after = request.args.get("after", 0, type=int)
    rows = db.execute("""SELECT id,sender_id,body,created_at,kind,att,att_name,att_mime,att_size,att_dur
                         FROM messages WHERE conversation_id=? AND id>? ORDER BY id""", (cid, after)).fetchall()
    return jsonify(me=g.user["id"], messages=[msg_json(r) for r in rows])


@app.route("/chat/file/<int:mid>")
@login_required
def chat_file(mid):
    """Dosiye zo mu biganiro zirebwa gusa n'abari muri icyo kiganiro."""
    db = get_db()
    m = db.execute("SELECT * FROM messages WHERE id=?", (mid,)).fetchone()
    if not m or not m["att"]:
        abort(404)
    conv_or_404(m["conversation_id"])
    path = os.path.join(CHAT_DIR, os.path.basename(m["att"]))
    if not os.path.isfile(path):
        abort(404)
    as_att = m["kind"] == "file" or request.args.get("dl") == "1"
    resp = send_file(path, mimetype=m["att_mime"], as_attachment=as_att, download_name=m["att_name"],
                     conditional=True, max_age=3600)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Cache-Control"] = "private, max-age=3600"
    resp.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    return resp


@app.route("/api/unread")
@login_required
def api_unread():
    n = 0 if g.user["role"] == "admin" else unread_count(g.user["id"])
    resp = jsonify(count=n)
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------- Ikarita ----------
@app.route("/map")
def map_page():
    return render_template("map.html")


@app.route("/api/listings")
def api_listings():
    """Amazu afite aho ari ku ikarita. Utarinjira abona aho ari hafi gusa (~1 km), atari neza."""
    rows = get_db().execute(LISTING_SELECT + """
        WHERE l.status='available' AND u.active=1 AND l.lat IS NOT NULL AND l.lng IS NOT NULL
        ORDER BY l.id DESC LIMIT 500""").fetchall()
    exact = g.user is not None
    items = [{
        "id": r["id"], "title": r["title"], "price": r["price"], "bedrooms": r["bedrooms"],
        "city": r["city_name"], "location": r["location"],
        "lat": r["lat"] if exact else round(r["lat"], 2),
        "lng": r["lng"] if exact else round(r["lng"], 2),
        "cover": url_for("uploads", name=r["cover"]) if r["cover"] else None,
        "url": url_for("listing", lid=r["id"]),
    } for r in rows]
    resp = jsonify(exact=exact, items=items)
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------- Errors ----------
ERRORS = {
    400: ("Ntibyakunze", "Ibyo wohereje ntibyemewe. Subira inyuma ugerageze."),
    403: ("Ntiwemerewe hano", "Iyi paji ntabwo ari iyawe. Subira ahabanza."),
    404: ("Paji ntiboneka", "Iyi paji ntiriho cyangwa yarasibwe. Subira ahabanza ushake inzu."),
}


def _error(e):
    title, text = ERRORS.get(e.code, ("Habaye ikibazo", "Subira ugerageze."))
    return render_template("error.html", code=e.code, title=title, text=text), e.code


for _c in ERRORS:
    app.register_error_handler(_c, _error)


# ---------- Admin ----------
@app.route("/admin")
@role_required("admin")
def admin():
    db = get_db()
    stats = {
        "users": db.execute("SELECT COUNT(*) FROM users WHERE role!='admin'").fetchone()[0],
        "owners": db.execute("SELECT COUNT(*) FROM users WHERE role='owner'").fetchone()[0],
        "listings": db.execute("SELECT COUNT(*) FROM listings").fetchone()[0],
        "available": db.execute("SELECT COUNT(*) FROM listings WHERE status='available'").fetchone()[0],
        "chats": db.execute("SELECT COUNT(*) FROM conversations").fetchone()[0],
    }
    cities = db.execute("""SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.city_id=c.id) AS n
                           FROM cities c ORDER BY c.name""").fetchall()
    users = db.execute("SELECT * FROM users WHERE role!='admin' ORDER BY id DESC").fetchall()
    listings = db.execute(LISTING_SELECT + " ORDER BY l.id DESC").fetchall()
    return render_template("admin.html", stats=stats, cities=cities, users=users, listings=listings)


@app.route("/admin/city/add", methods=["POST"])
@role_required("admin")
def admin_city_add():
    name = request.form.get("name", "").strip()
    if name:
        db = get_db()
        try:
            db.execute("INSERT INTO cities(name) VALUES(?)", (name,))
            db.commit()
            flash(f"Umugi {name} wongeweho.", "ok")
        except sqlite3.IntegrityError:
            flash("Uwo mugi usanzwe uriho.", "warn")
    return redirect(url_for("admin") + "#cities")


@app.route("/admin/city/<int:cid>/delete", methods=["POST"])
@role_required("admin")
def admin_city_delete(cid):
    db = get_db()
    if db.execute("SELECT 1 FROM listings WHERE city_id=?", (cid,)).fetchone():
        flash("Ntushobora gusiba umugi ufite amazu. Banza usibe amazu.", "warn")
    else:
        db.execute("DELETE FROM cities WHERE id=?", (cid,))
        db.commit()
        flash("Umugi wasibwe.", "ok")
    return redirect(url_for("admin") + "#cities")


@app.route("/admin/user/<int:uid>/toggle", methods=["POST"])
@role_required("admin")
def admin_user_toggle(uid):
    db = get_db()
    db.execute("UPDATE users SET active=1-active WHERE id=? AND role!='admin'", (uid,))
    db.commit()
    flash("Imiterere ya konti yahindutse.", "ok")
    return redirect(url_for("admin") + "#users")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=os.environ.get("DEBUG") == "1")
