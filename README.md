# হিসাবখাতা

বাংলা-ভিত্তিক, মোবাইল-উপযোগী আয়, ব্যয় ও ধার-দেনার হিসাব অ্যাপ। Firebase Authentication-এ Google লগইন এবং Cloud Firestore-এ per-user cloud storage ব্যবহার করে।

লাইভ অ্যাপ: https://almuafy-hisab-e8803.web.app/

## ফিচার

- আয় ও খরচ: বিবরণ, খাত, পরিমাণ, তারিখ ও নোট
- ধার দেওয়া/নেওয়া: ব্যক্তির নাম, মূল তারিখ, ফেরতের তারিখ ও নোট
- আয়/ব্যয়/ব্যালেন্স সারাংশ, গত ৬/১২ মাসের চার্ট, খরচের খাত
- লেনদেন তালিকা, ধরনভিত্তিক ফিল্টার ও নাম/খাত দিয়ে খোঁজা
- দৈনিক, মাসিক ও বার্ষিক হিসাবের PDF এবং CSV রিপোর্ট ডাউনলোড
- ফোনে ব্যবহারযোগ্য ন্যাভিগেশন ও ফর্ম
- Google অ্যাকাউন্টভিত্তিক আলাদা ডেটা; Firestore Rules-এ অন্যের ডেটা আটকানো
- Bornomala Regular ও Bold ফন্ট local asset হিসেবে সংরক্ষিত

## Firebase সেটআপ

Firebase project `almuafy-hisab-e8803`-এর web app config `firebase-config.js`-এ যুক্ত। Firebase Console-এ Google Authentication চালু এবং Cloud Firestore database তৈরি আছে। অ্যাপ Google popup login, user-specific Firestore records এবং live snapshot sync ব্যবহার করে। `firestore.rules` প্রতিটি ব্যবহারকারীর ডেটা তার নিজের UID-তে সীমাবদ্ধ করে।

Rules প্রকাশ করতে Firebase CLI-তে project login করে project root থেকে চালান:

```sh
firebase deploy --only firestore:rules
```

## GitHub Pages প্রকাশ

GitHub Actions workflow (`.github/workflows/pages.yml`) `main` branch-এ push হলে GitHub Pages-এ root-এর ফাইল প্রকাশ করে। Repository Settings → Pages → Build and deployment-এ **GitHub Actions** নির্বাচন করুন। প্রকাশের পর GitHub Pages domain Firebase Authentication → Settings → Authorised domains-এ যোগ করুন। Web API key browser-এ ব্যবহারের জন্য; প্রকৃত ডেটা সুরক্ষা Firestore Rules দিয়ে হয়। কোনো service account key কখনো repository-তে রাখবেন না।

## Firebase Hosting

`firebase.json` এবং `.firebaserc` তৈরি আছে এবং Firebase Console-এ লিংক করা `almuafy-hisab-e8803` Hosting site-এ নির্দেশ করে। Hosting ও Firestore Rules একসাথে প্রকাশ করতে project root-এ চালান:

```sh
firebase deploy --only hosting,firestore:rules
```

## স্থানীয় preview

এই অ্যাপটি ES modules ও Firebase CDN imports ব্যবহার করে, তাই `file://` থেকে নয়, HTTP server দিয়ে চালাতে হবে। Root folder-টি যেকোনো static HTTP server পরিবেশন করতে পারে। Firebase কনফিগার করা এবং HTTPS domain-এ প্রকাশিত হলে Google popup লগইন কাজ করবে।

## ফন্ট ও PDF লাইসেন্স

Bornomala Regular এবং Bold ফন্ট `assets/fonts/`-এ রাখা আছে; মূল ফন্টের OFL 1.0 লাইসেন্স ও attribution সেখানেই রয়েছে। `html2pdf.js` browser-side PDF তৈরিতে ব্যবহৃত হয়; এর MIT license `vendor/`-এ আছে।
