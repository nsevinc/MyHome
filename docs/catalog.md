# Model kataloğu

Luna berjer, Pera konsol ve Ada yan sehpa bu proje için uygulama kodundan üretilmiştir. Harici model, doku ve marka dosyası bulunmaz. Kayıtlı modeller sürüm 1'dir.

Her modelin `web` ve `render` GLB sürümleri bulunur. `public/models` altında web için daha hafif sürüm, `assets/models` altında yalnızca Cycles'ın okuduğu ayrıntılı sürüm tutulur. `npm.cmd run catalog:generate` her ikisini de yeniden üretir. Yeni katalog sürümü eklenirken eski proje dosyalarının açılması için önceki sürüm dosyaları saklanmalıdır.

Üçüncü taraf katalog eklenirken model başına kaynak, lisans ve uygulama içinde dağıtım ve çıktıda kullanım hakları kaydedilir. Kişisel GLB yükleme, model dosyasını kullanıcının proje dosyasında saklar.
