# Windows'ta taşınabilir MyHome

1. ZIP arşivinin tamamını kendi yazma yetkin olan bir klasöre çıkar.
2. `MyHome.cmd` dosyasını çalıştır. MyHome varsayılan tarayıcıda `http://127.0.0.1:5188` adresini açar.
3. MyHome'u kullanırken başlatıcı penceresi açık kalsın. Pencerede **Ctrl+C** ile uygulamayı kapatabilirsin.

Paket Windows x64 içindir. Node.js ve derlenmiş MyHome dosyaları arşive dahildir. Çizim, 3B önizleme, PDF ve proje arşivi yerel çalışır.

## Cycles render

[Blender 4.5 LTS](https://www.blender.org/download/lts/4-5/) pakete ayrı eklenir. Standart Windows kurulumunu kullanabilir veya Blender ZIP dosyasının içeriğini MyHome klasöründeki `blender` klasörüne çıkarabilirsin. `blender\blender.exe` ve Blender'ın diğer dosyaları bu klasörde birlikte olmalı. Başka bir kurulum yolu kullanıyorsan `ayarlar.json` içindeki `blender` alanına exe yolunu yaz. JSON içinde örnek yol `"C:/Program Files/Blender Foundation/Blender 4.5/blender.exe"`.

Cihaz varsayılan olarak CPU'dur. Ayar değişikliğinden sonra MyHome'u yeniden başlat.

## Oda ve render arşivini taşımak

Geliştirme bilgisayarındaki MyHome'dan bir oda için **Proje → Projeyi renderlarla indir**, tüm oda ve sürümler için **Proje → Yerel projeler → Yedeği indir** seçeneğini kullan. Oluşan `.workspace.json` dosyasını yeni bilgisayarda **Proje → Projeyi aç** ile içe aktar.

Projeler tarayıcının profilinde ve MyHome'un yerel adresinde saklanır. Cycles kuyruğu ve çıktıları `%LOCALAPPDATA%\MyHome` içinde tutulur. Yerel adresi veya tarayıcıyı değiştirmeden önce çalışma alanını yedekle.

**Proje → Teslim paketi oluştur** ile kayıtlı bir sürümün montaj PDF’sini, eşleşen renderlarını ve düzenlenebilir yedeğini tek ZIP’te indir. ZIP’i çıkardıktan sonra `Proje.workspace.json` dosyasını **Proje → Projeyi aç** ile yükle.

## Geliştirme bilgisayarında yeni paket üretmek

Bağımlılıklar kurulduktan sonra `npm.cmd run package:windows` komutunu çalıştır. Paketleyici resmi Windows x64 Node.js arşivini indirir ve SHA-256 değerini doğrular. Önceden hazırlanmış bir çalışma zamanı için `npm.cmd run package:windows -- --runtime "C:/NodePortable"` kullanabilirsin. ZIP ve SHA-256 dosyası `output/packages` klasörüne yazılır.
