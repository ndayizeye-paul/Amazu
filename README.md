# Amazu Yo Gukodesha

Urubuga rwo gukodesha amazu mu migi itandukanye (Flask + SQLite).

## Gutangira

```bash
pip install -r requirements.txt
python app.py
```

Hanyuma fungura http://localhost:5000

## Konti ya Admin

- Email: `admin@amazu.rw`
- Ijambo ry'ibanga: `Admin@12345`

**Hindura iryo jambo ry'ibanga ako kanya** (kanda izina ryawe hejuru → "Hindura ijambo ry'ibanga"),
cyangwa uritangire mbere yo gutangira:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='ijambo-rikomeye' SECRET_KEY='ijambo-rirerire-ry-ibanga' python app.py
```

## Design na logo

- Logo ziri muri `static/brand/` (SVG): `logo.svg`, `logo-light.svg` (ku mutaka wijimye), `logo-mark.svg`, `favicon.svg`.
- Ibara: icyatsi cy'imisozi `#1F5D45`, umuhondo w'izuba `#F5B800`, wino `#12261E`.
- Inyuguti: Bricolage Grotesque (imitwe) na Figtree (ibisobanuro), zikurwa kuri Google Fonts. Server igomba kuba ifite internet; bitaba ibyo urubuga rukoresha inyuguti za sisitemu.

## Ibishya bishya

- **Ubutumwa bushya**: umubare w'ubutumwa butarasomwa ugaragara kuri "Ubutumwa" hejuru, ugahinduka wenyine buri masegonda 8, kandi hari na toast n'umubare mu mutwe wa tab.
- **Umwijima n'umucyo**: urubuga rutangirana n'ibara ry'umwijima; akabuto k'izuba/ukwezi hejuru gahindura, kandi ihitamo ry'umukoresha ribikwa muri browser ye.
- **Ifoto ya profile**: kanda izina ryawe → "Ifoto ya profile". Ifoto ihinduka kare 320x320 kandi igaragara mu nav, mu biganiro no ku nzu.
- **Kurinda amakuru**: utarinjira abona amafoto n'ibiciro ku rutonde gusa. Kureba inzu yose, telefoni ya nyirinzu, chat n'aho inzu iri neza bisaba kwinjira.
- **Loading nyuma yo kwinjira**: nyuma ya login cyangwa kwiyandikisha, hagaragara paji ya "Karibu" ifite loading, hanyuma dashboard igafunguka.
- **Ikarita**: `/map`. "Shaka hafi yanjye" ikoresha aho umukoresha ari (browser ibanza kumusaba uruhushya), igashyira amazu ku murongo uhereye ku hakwegereye, ikerekana intera. Banyirinzu bahitamo aho inzu iri ku ikarita mu ifishi yo gushyiraho inzu.

## Icyitonderwa ku ikarita

- Ikarita ikoresha tiles za OpenStreetMap (zikenera internet) kandi ntisaba ubundi bubiko cyangwa API key. Ku mubare munini w'abakoresha, tekereza gukoresha tile server yawe.
- **Gushaka aho uri bisaba HTTPS** kuri server nyayo (kuri localhost birakora nta HTTPS).
- Ukoresha database yari isanzwe: ntacyo uhindura, inkingi nshya zongerwaho zonyine uko porogaramu itangiye.
- `Pillow` iri muri `requirements.txt` (ikoreshwa mu gutunganya amafoto ya profile).

## Uko bikora

- **Abashaka inzu**: bahitamo umugi, bareba amazu n'amafoto, bakanda "Vugana na nyirinzu" (basabwa konti).
- **Banyirinzu**: bafungura konti ya "Nyirinzu", bagashyiraho amazu (umugi, aho iherereye, igiciro, telefoni, amafoto agera kuri 8).
- **Chat**: ubutumwa buhita bugaragara (bugaruka buri masegonda 3).
- **Admin** (`/admin`): ongeraho/siba imigi, hagarika konti, siba amazu, reba imibare.

## Kuyishyira kuri server

```bash
gunicorn -w 2 -b 0.0.0.0:8000 app:app
```

Bika ububiko `amazu.db` na `uploads/` buri gihe (backup). Koresha HTTPS na `SECRET_KEY` yawe bwite.

## Phone, tablet na desktop
- Urubuga rwubatse "mobile-first": rukora kuri ecran guhera kuri 320px kugeza kuri desktop nini; nta scroll y'iburyo.
- Kuri telefoni (touch) utubuto n'amahuza bifite nibura 44px; inputs ni 16px (iOS ntizoomo); ecran zifite notch zirubahirizwa (`viewport-fit=cover`).
- Ushobora kuruzana kuri home screen (PWA yoroheje): Android Chrome → "Add to Home screen"; iPhone Safari → Share → "Add to Home Screen". Hari manifest n'amashusho (`static/manifest.webmanifest`, `static/brand/icon-*.png`).

## 3D n'animations
- **Inzu ya 3D** mu hero ya paji nkuru (CSS 3D, nta library): izenguruka yonyine, ushobora kuyizunguza urutoki/imbeba. Izuba, ibiciro bireremba na ground shadow biri inyuma yayo.
- **Amakarita ya 3D**: amakarita y'amazu, imigi n'imibare bihengama bikurikira imbeba, bifite urumuri. Kuri phone bikanda "press".
- **Animations**: gugaragara buhoro buhoro iyo ugeze ku gice, imibare izamuka, imisozi igenda buhoro iyo uzunguye, paji zihinduranya neza, utubuto dufite urumuri.
- **Kaze** (umufasha w'animation): avuga ibijyanye na paji urimo (ahabanza, umugi, inzu, ikarita, konti, nyirinzu...), amaso ye akurikira urutoki, kandi atanga utubuto two kujya aho ushaka. Ushobora kumuhisha ("Ntukongere kunyereka") ukamugarura hasi mu footer. Ntagaragara mu biganiro (chat) no kuri admin.
- Byose bihagarara iyo umukoresha afite "reduce motion" muri system ye, kandi ibirimo bigaragara no iyo `fx.js` itakoze.
- Amafayilo: `static/js/fx.js`, `static/js/kaze.js`, `templates/_house3d.html`, `templates/_kaze.html`, n'ibice bya 3D/animation mu mpera za `static/style.css`.

## Chat: ifoto, voice note, dosiye
- Mu kiganiro ushobora kohereza **ifoto** (jpg, png, webp, gif; ≤10 MB), **voice note** (urakanda mic ugafata ijwi, ≤3 min) na **dosiye** (pdf, doc, docx, xls, xlsx, ppt, pptx, txt, csv; ≤10 MB). Ushobora no gufata ifoto ukayikanda (paste) cyangwa ukayikurura (drag) mu kiganiro.
- Umutekano: ubwoko bwa dosiye busuzumwa mu mutwe wayo (ntibwizerwa izina cyangwa "content-type"); amafoto arasubizwamo kandi EXIF (aho yafatiwe) ikavaho; dosiye zibikwa ahatagaragara kuri bose (`chat_files/`, cyangwa `CHAT_DIR`) kandi zirebwa gusa n'abari muri icyo kiganiro.
- Voice note isaba **HTTPS** kuri server nyayo (kuri localhost birakora). Kuri database isanzwe, inkingi nshya zongerwaho zonyine.
- Hinduka ububiko: kora backup ya `chat_files/` hamwe na `uploads/` na database.

## Kaze avuga mu ijwi
- Kaze akoresha ijwi rya sisitemu y'umukoresha (Web Speech API): Kinyarwanda niba rihari, ubundi Kiswahili. Browser nyinshi zisaba ko umukoresha abanza gukanda ku rupapuro mbere y'uko ijwi ritangira (Kaze yerekana akabuto "Umbwire mu ijwi"). Kuzimya cyangwa gukora ijwi: akabuto k'ijwi mu kibumbe cya Kaze.
- Icyitonderwa: ibikoresho byinshi (cyane cyane Chrome kuri computer) nta ijwi rya Kinyarwanda bifite. Kuri Android: Settings → Text-to-speech.

## Ikarita nini yo gushyiraho aho inzu iri
- Mu ifishi y'inzu, ikarita ntoya ni "preview": ukandaho ikifungura nini ku ecran yose. Yobora ikarita kugeza urushinge rwo hagati rurebye ku nzu yawe, hanyuma "Emeza aha hantu". Kuri phone ntibibangamira scroll y'ifishi.
- Isaba zoom ≥ 16 kugira ngo aho inzu iri hagaragare neza. Hari "Satellite" (Esri), "Aho ndi" (GPS), no gushakisha agace (OpenStreetMap Nominatim, bisaba internet).
