# GitHub ve Cloudflare Pages / Publishing

## 1. Proje klasörünü aç / Open the project folder

VS Code’da **Dosya → Klasör Aç** ile geliştirme yaptığın MyHome klasörünü seç. Sol tarafta `src`, `.github`, `package.json` ve `LICENSE` görünür. **Terminal → Yeni Terminal** ile PowerShell aç. Geliştirme, test, derleme ve Git işlemlerini bu terminalde çalıştır.

Open your MyHome working folder in VS Code, then open an integrated PowerShell terminal. Use this same repository for editing, testing, building and pushing changes.

## 2. Geliştir ve test et / Develop and test

İlk kurulumda veya bağımlılık kilidi değiştiğinde `npm.cmd ci` çalıştır. `npm.cmd run dev` editörü 5273 portunda açar. Test ve üretim derlemesi için aşağıdaki iki komutu çalıştır.

Install dependencies with `npm.cmd ci` on a fresh checkout or after a lockfile change. Use `npm.cmd run dev` for the editor at port 5273. Run both checks before publishing.

```powershell
npm.cmd test
npm.cmd run build
```

`tests/` otomatik kontrollerin kaynak kodunu içerir. Elle üretilen render ve test dosyalarını `output/` veya `tmp/` içinde sakla. Git bu klasörleri, proje yedeklerini, veritabanlarını, kişisel ayarları ve derleme çıktılarını atlar. Katalog modelleri ile rehber görselleri uygulamanın parçasıdır.

The repository includes automated tests, catalogue models and guide images. Put manual test output and renders in `output/` or `tmp/`. Git ignores those folders, personal backups, databases, local settings and build output.

## 3. GitHub’a gönder / Push to GitHub

VS Code terminalinde dalı ve bağlı deponun adını kontrol et. Ana MyHome deposu için dal `main`, uzak deponun adı `origin` ve hedef `nsevinc/MyHome` olur. `git add --dry-run .` eklenecek dosyaları listeler.

Check your branch and remote. For the main MyHome project, push the `main` branch to the `origin` remote for `nsevinc/MyHome`. Review the dry run before staging.

```powershell
git branch --show-current
git remote -v
git add --dry-run .
```

İlk yükleme için aşağıdaki komutları kullan. GitHub oturum açmanı isterse tarayıcıda deponun sahibi olan hesapla giriş yap. **Code** sekmesinde kaynaklar, **Actions → Check MyHome** altında test ve derleme sonucu görünür.

Use these commands for the first push. Sign in when prompted. Open the **Code** tab to see the sources and **Actions → Check MyHome** for the test and build results.

```powershell
git add .
git diff --cached --stat
git commit -m "Release MyHome 0.2.0"
git push -u origin main
```

Sonraki değişikliklerde VS Code’un **Kaynak Denetimi / Source Control** panelinde istediğin dosyaları `+` ile seçip bir commit mesajı yazabilir, **Commit** ve ardından **Push** ile aynı depoya gönderebilirsin.

For later changes, select the files in the Source Control view, enter a commit message, commit and push.

## 4. Windows indirmesini oluştur / Create the Windows release

**Check MyHome** başarılı olduğunda aynı terminalde sürüm etiketini gönder.

```powershell
git tag v0.2.0
git push origin v0.2.0
```

**Actions → Windows release** tamamlanınca **Releases → v0.2.0** altında Windows x64 ZIP’i ve SHA-256 dosyası görünür. README’deki Windows indirme bağlantısı bu sürümü açar. ZIP’i çıkarıp `MyHome.cmd` ile başlatabilirsin.

Once the check passes, push the tag above. The Windows workflow builds the archive and publishes it with its checksum under **Releases → v0.2.0**. To verify a download in PowerShell, run `Get-FileHash -Algorithm SHA256 .\MyHome-Windows-x64-0.2.0.zip` and compare with the checksum file.

## Daha sonra · Cloudflare Pages / Later · Cloudflare Pages

Web yayınını açacağın zaman üretim dalı olarak **main**, kök olarak depo kökü, derleme komutu olarak **npm run build**, çıktı dizini olarak **dist** ve ortam değişkeni olarak **NODE_VERSION=22.23.5** seç. Pages adresi belli olduğunda aşağıdaki komuta kendi depo ve site adresini gir. Değişen README.md ve package.json dosyalarını commit edip gönder.

When you are ready to deploy the web edition, connect Pages to **main**, build with **npm run build** at the repository root, publish **dist**, and set **NODE_VERSION=22.23.5**. Once you know the actual HTTPS address, run the following locally and push the updated files.

```powershell
npm.cmd run publication -- --repo OWNER/MyHome --site https://YOUR-PROJECT.pages.dev
```

## Yayın kontrolü / Acceptance

Web sitesinde boş bir oda ve LED’li bir dolap oluştur. Bir kamera kaydet, PNG al, galeriden aç ve projeyi renderlarla indir. Sonra Windows paketinde aynı yedeği geri yükle. Kamera, malzeme, ölçü ve yerleşimi kontrol et. 4K Cycles çalıştırarak sonucu galeriden indir.

Create a fresh web project and export its image backup. Restore it on Windows, compare the camera, materials and furniture placement, then render a 3840 × 2160 PNG and open it in the gallery.

[Cloudflare Git integration](https://developers.cloudflare.com/pages/get-started/git-integration/) · [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
