import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import type { ReactNode } from 'react'

type Topic = { id: string; title: string; image: string; caption: string; steps: ReactNode[]; localSteps?: ReactNode[]; note?: string }
const topics = [
  { id: 'room', title: 'Odayı çiz', image: 'oda-cizimi.png',
    caption: 'Köşeler taslağın üstünde işaretlenir. Plan önerisinde kapı ve pencereyi çizime almadan önce inceleyebilirsin.',
    steps: [
      <>Üst çubuktan <strong>Oda çiz</strong> seç. Boş ızgarayla başla veya JPG, PNG ya da tek sayfalık PDF yükle.</>,
      <>Taslakta <strong>Ölçeği ayarla</strong> ile iki nokta seç ve aralarındaki gerçek iç mesafeyi gir. Köşeleri sırayla işaretleyip çizimi kaydet.</>,
      <>Plana dönüp bir duvar seç. Sağ panelden <strong>Kapı, Pencere, Kolon</strong> veya <strong>Kiriş</strong> ekle ve ölçülerini gir. Kirişin alt kotunu bitmiş zeminden ölç.</>,
    ] },
  { id: 'items', title: 'Eşyaları yerleştir', image: 'esya-2b-duzenleme.png',
    caption: '2B planda masanın yanındaki döndürme tutamacı ve sağ panelde anlık dönüş açısı görünür.',
    steps: [
      <>Sol kataloğun kategorilerinden bir eşya ekle. Kendi modelin için <strong>3B modeller</strong> sekmesinden dokuları gömülü bir GLB yükle.</>,
      <>Eşyayı seç ve sağdan <strong>Genişlik, Derinlik, Yükseklik</strong> değerlerini gir. Planda sürükle veya <strong>Konum X/Z</strong> alanlarını kullan.</>,
      <>Serbest duran bir eşyayı seç ve <strong>2B</strong> veya <strong>3B</strong> görünümde döndürme tutamacını sürükle. 2B planda <strong>Hizala</strong> açıkken açı 15° adımlarla ilerler. Serbest döndürmek için sürüklerken <strong>Alt</strong> tuşunu basılı tut.</>,
      <>Tek bir montajlı eşyayı diğer duvara yaklaştır. 2B planda hedef duvar renklenir. Uygun bir noktada bıraktığında eşya mevcut alt kotuyla duvara döner. Pencereye bağlı perdelerin penceresini sağ panelden değiştir.</>,
      <>Birden çok eşya seçmek için <strong>Shift</strong> tuşunu kullan. <strong>Del</strong> ile seçili eşyaları kaldırabilir, <strong>Geri al</strong> ile tek adımda geri getirebilirsin. Kilitli eşyalar yerinde kalır.</>,
      <>Bir gardırop seçtiğinde kapak hareketi, cam veya opak kapak ve iç bölmeleri sağ panelden düzenle. Projede kaydedilecek kapak durumunu <strong>Projede kapak durumu</strong> alanından seç.</>,
    ] },
  { id: 'adjacent-copy', title: 'Eşyayı bitişik kopyala', image: 'bitisik-kopya.png',
    caption: 'Sağdaki üst dolap seçili. Yeşil artı ve kesik çizgi, üçüncü dolabın aynı yükseklikte sığacağı yeri gösterir.',
    steps: [
      <>2B planda bir dolabı seçip imleci sağ veya sol kenarına götür. Aynı ölçülerde bir kopya sığıyorsa <strong>+</strong> görünür. Kesik çizgi yerini gösterir.</>,
      <>İstediğin taraftaki <strong>+</strong> düğmesine bas. Yeni eşya seçilir. Yer varsa aynı işlemi tekrarlayabilirsin. Bu düğmeyi 3B görünümde ve duvara monte eşyalarda duvar görünüşünde de kullanabilirsin.</>,
      <>Sağ paneldeki <strong>Eşyayı kopyala</strong> düğmesi önce eşyanın sağını, ardından solunu dener. Kopya bağımsız düzenlenir. Son eklemeyi kaldırmak için <strong>Geri al</strong> düğmesine bas.</>,
    ] },
  { id: 'keep-clear', title: 'Bu alanı boş tut', image: 'bos-tutulacak-alan.svg',
    caption: 'Yeşil alan dolap önünde ayrılan geçişi, mavi dikdörtgen taşınan yatağı gösterir.',
    steps: [
      <>2B planda gardırop dizisinin bir modülünü seç. <strong>Eşya özellikleri → Bu alanı boş tut</strong> bölümünde mesafeyi gir ve <strong>Alanı ayır</strong> düğmesine bas. Şerit her modülün kendi ön kenarını izler.</>,
      <>Yatağı sürüklerken şeridi ve plandaki <strong>Kalan geçiş</strong> değerini izle. Kırmızı bölümde hedefin kaç cm eksik kaldığını görürsün. Geri hareket için yeterli yer varsa gereken mesafe, önünde engel varsa kullanılabilir mesafe gösterilir.</>,
      <>Bir yatağın yanını korumak için yatağı seçip sol veya sağ kenarı işaretle. Mesafeyi aynı bölümde değiştirebilir veya <strong>Alanı kaldır</strong> düğmesini kullanabilirsin.</>,
    ] },
  { id: 'wall-edit', title: 'Duvarda yüksekliği ayarla', image: 'duvar-kot-ve-kopya.png',
    caption: 'Duvar görünüşü alt ve üst kotu gösterir. Kesik çizgili önizleme, seçilen merkez aralığındaki kopyayı işaretler.',
    steps: [
      <>Duvara monte bir eşya seçip sağ panelde <strong>Duvar görünüşünde düzenle</strong> düğmesine bas. Üstteki duvar listesinden başka bir duvar da seçebilirsin.</>,
      <>Kot için eşyayı yukarı veya aşağı, duvar üzerindeki yerini değiştirmek için sağa veya sola sürükle. <strong>5 cm’ye hizala</strong> açıkken <strong>Alt</strong> ile hizalamayı geçici olarak kapatabilirsin.</>,
      <><strong>Aynı kotta çoğalt</strong> düğmesine bas. Yönü ve <strong>Merkezler arası</strong> mesafeyi seç. Kesik çizgili önizleme uygun olduğunda <strong>Kopyayı ekle</strong> düğmesine bas.</>,
    ],
  },
  { id: 'wall-symmetry', title: 'Simetrik yerleştir', image: 'simetri-uygun-aralik.png',
    caption: '40 cm mesafede aplikler aynayla örtüşüyor. Sabit kablo çıkışları açıkken 51–59 cm aralığı öneriliyor.',
    steps: [
      <>Duvar görünüşünde <strong>Simetrik yerleştir</strong> düğmesine bas. Yatağı, duvar aynasını veya duvarın merkezini referans seç.</>,
      <>Sol ve sağdaki eşyayı seçip <strong>Eksenden uzaklık</strong> değerini gir. <strong>Uygun aralık bul</strong> düğmesi çakışmasız mesafeleri gösterir. Sabit elektrik çıkışlarına göre çalışmak için <strong>Sabit kablo çıkışlarıyla eşleşsin</strong> seçeneğini açık tut.</>,
      <>Önerilen mesafenin yanındaki <strong>önizle</strong> düğmesine bas. Her iki tarafın açıklığını kontrol et. Kayıtlı bir simetri kuralında, referansı taşıdıktan sonra aynı aramayı önizleme kartından yapabilirsin.</>,
      <><strong>Simetrik yerleşimi uygula</strong> ile iki eşyayı birlikte kaydet. İnce ayar için eşyayı duvar görünüşünde sağa veya sola sürükleyebilirsin.</>,
      <><strong>Kural olarak kaydet</strong> dersen referansı taşıdığında iki eşyanın yeni konumu, ayna boşluğu ve etkilenen elektrik noktaları önizlenir. <strong>Simetriyle birlikte uygula</strong> ile değişikliği kaydet. Kuralı duvar görünüşündeki <strong>Kayıtlı simetri</strong> listesinden düzenleyebilir veya kaldırabilirsin.</>,
    ],
  },
  { id: 'electrical', title: 'Elektrik noktalarını işaretle', image: 'elektrik-noktalari.png',
    caption: 'Duvar görünüşünde P priz, A anahtar ve K kablo çıkışını gösterir. Turuncu işaretlerde eşleşme beklenir, kırmızı işaretlerde açıklık veya bir eşya noktayı engeller.',
    steps: [
      <><strong>Duvar → Elektrik noktaları</strong> bölümünü aç. Priz, anahtar veya aplik kablo çıkışı seçip <strong>Nokta ekle</strong> düğmesine bas.</>,
      <>Noktanın merkezini duvar başından ve bitmiş zeminden ölç. Deneme için eklediğin noktaları <strong>Örnek ölçü</strong> olarak işaretle.</>,
      <><strong>Yerleşimler</strong> karşılaştırmasında veya <strong>Montaj Öncesi Kontrol</strong> ekranında erişimi ve aplik eşleşmesini incele. Noktaları 2B planda veya duvar görünüşünde seçebilirsin.</>,
      <><strong>Proje → Montaj planı PDF</strong> yolundan yerleşimi ve duvarı seç. Çizimdeki P, A ve K numaralarını alttaki ölçü ve erişim tablosuyla eşleştir.</>,
    ],
  },
  { id: 'focus', title: 'Eşyayı bul ve odaklan', image: 'esya-odagi.svg',
    caption: 'Planda seçilen dolap, odak görünümünde büyütülür.',
    steps: [
      <><strong>Odadaki eşyalar</strong> bölümünde eşya adını yaz. <strong>Eşya kategorisi</strong> ile listeyi daralt. Tek sonuç varsa Enter ile seçebilirsin.</>,
      <>Listeden bir eşyaya tıkla. Açık <strong>2B plan</strong> veya <strong>3B görünüm</strong> o eşyaya odaklanır. Birden çok eşyayı Shift ile seçip <strong>Seçilene odaklan</strong> düğmesini kullanabilirsin.</>,
      <><strong>Yalnızca seçileni göster</strong> ile ayrıntılara bak. <strong>Tümünü göster</strong> ile oda görünümüne dön.</>,
    ],
    note: 'Odak ve gizleme çalışma görünümüne uygulanır. PNG, kayıtlı render kamerasıyla bütün odayı gösterir.',
  },
  { id: 'bedroom-catalog', title: 'Yatak odası kataloğu', image: 'yatak-odasi-modelleri.jpg',
    caption: 'Makyaj masası, komodin ve puf seçenekleri. Görseller katalogdaki modellerin Cycles görüntüleridir.',
    steps: [
      <><strong>Yatak odası → Tamamlayıcı eşyalar</strong> bölümünü aç. <strong>Eşya türü</strong> alanından örneğin <strong>Oturma pufları</strong> seç. Karttaki ölçüler en × derinlik × yükseklik sırasındadır. Aynalı makyaj masalarında yükseklik aynayı da kapsar.</>,
      <>Karta tıklayarak modeli odaya ekle. Duvar rafı, ayna ve asma dolap için önce planda montaj duvarını seçebilirsin.</>,
      <>Eşyayı seçip sağ panelden ölçülerini, rengini ve parça malzemelerini düzenle. Aynı konumda başka bir tasarımı denemek için <strong>Eşyayı değiştir</strong> düğmesini kullan.</>,
    ] },
  { id: 'cabinet-light', title: 'Dolap LED aydınlatması', image: 'dolap-led-montaji.png',
    caption: 'Cycles örneğinde soldan sağa raf altı, dolap iç tavanı, sol iç yan panel ve tavana doğru dolap üstü aydınlatma görülür.',
    steps: [
      <><strong>Eşya ekle → Gardıroplar</strong> veya <strong>Duvar dolapları</strong> kategorisini aç. Türü filtrele ve görsel karttan bir model ekle. Kart ölçüleri en × derinlik × yükseklik sırasındadır.</>,
      <>Dolabı seç. Sağ panelde <strong>Dolap LED ışığını aç</strong> seçeneğini işaretle. <strong>LED konumu</strong> ile montaj yüzeyini belirle. Raf altı şeritler eklediğin veya taşıdığın rafları izler.</>,
      <><strong>Işık tonu</strong> ile bir beyaz seç veya <strong>LED rengi</strong> ile kendi rengini belirle. Parlaklığı sürgüyle ayarla. Çalışırken içini görmek için <strong>Kapakları 3B düzenleyicide göster</strong> işaretini kaldırabilirsin.</>,
      <>Cycles görüntüsünde kapakların da açık görünmesini istiyorsan gardıropta <strong>Projede kapak durumu → Açık</strong> seç. İç ışık, kapalı opak kapağın arkasında kalır. Her dolabın LED ayarları projeyle kaydedilir.</>,
    ] },
  { id: 'bedroom', title: 'Yatak başı sistemi', image: 'yatak-basi.svg',
    caption: 'Örnek cephede yatak ile üst dolap arasındaki boşluk gösterilir.',
    steps: [
      <><strong>Eşya kataloğu → Yatak odası → Yatak başı ve üst dolaplar → Yatak başı sistemi</strong> yolunu aç. Yatağı ve başlık duvarını seç.</>,
      <><strong>Sade yatak başı</strong> ile kumaş panel ve aplikleri, <strong>Depolama odaklı</strong> ile üst ve yan dolapları dene. Her modülün ölçülerini, alt kotunu, kapak sayısını ve kapak yüzeyini ayrı düzenle.</>,
      <><strong>Yan kesit</strong> listesinden modülü seç. Dolabın yatak üstü açıklığını, kiriş veya tavan boşluğunu ve kapak uyarılarını kontrol et.</>,
      <><strong>Alternatif yerleşim olarak kaydet</strong> ile tasarımı ayrı dene. Sonra bir parçayı seçerek malzemesini ve kapak ayarlarını sağ panelde değiştir.</>,
    ],
    note: 'Askılı komodinler için yatağın yanındaki duvar payı kullanılır. Gerekli yer olmadığında sistem bunu önizlemede gösterir.',
  },
  { id: 'usage', title: 'Kullanım senaryoları', image: 'kullanim-senaryolari.svg',
    caption: 'Kesik çizgi, örnek odada dolapların önünden geçen deneme rotasını gösterir.',
    steps: [
      <>Üst çubuktan <strong>Kullanım</strong> bölümünü aç. Hareketli eşyayı ve kapağı veya çekmeceyi seçip <strong>Hareketi ekle</strong> düğmesine bas.</>,
      <><strong>Planda rota çiz</strong> ile başlangıç, dönüş ve varış noktalarını seç. Geçiş hedefini ve denetim yüksekliğini gir.</>,
      <>Sol ve sağ yerleşimi seçerek aynı rotayı iki düzende ölç. İşaretlenen en dar noktayı görmek için <strong>3B’de incele</strong> düğmesini kullan.</>,
      <><strong>Senaryoyu kaydet</strong> ile rotayı ve açılım değerlerini projeye ekle. Kayıtlı senaryoyu aynı panelden yeniden açabilirsin.</>,
    ],
    note: 'Rota ölçüsü, çizginin geçtiği kesitlerdeki net yatay açıklığı gösterir. Hareketler prova görünümünde uygulanır.',
  },
  { id: 'smart', title: 'Uygun konum bul', image: 'akilli-yerlesim.png',
    caption: 'Kesikli mavi çizgi önerilen konumu, seçili kart ise hareket miktarını ve boşluğu gösterir.',
    steps: [
      <>Bir eşya seç ve sağ panelde <strong>Uygun konum bul</strong> düğmesine bas. Birlikte taşımak istediğin eşyaları <strong>Shift</strong> ile seçebilirsin.</>,
      <>Arama mesafesini seç. Tek bir serbest eşyada <strong>90° dönüşleri de dene</strong> seçeneği, farklı yönleri aramaya dahil eder.</>,
      <>Bir sonuca tıkla ve kesikli önizlemeye bak. Kayıtlı geçiş ölçüsü varsa sonucunu kartta görürsün. <strong>Konumu uygula</strong> ile taşı ve gerekirse <strong>Geri al</strong> ile önceki konuma dön.</>,
    ],
    note: 'Arama 1 ve 5 cm aralıklarla örnek konumları dener. Sonuç çıkmazsa engelleri incele veya mesafeyi artır. Kapak ve çekmece kontrollerinde kayıtlı kapak ayarları kullanılır.',
  },
  { id: 'linked', title: 'Eşyaları birbirine bağla', image: 'bagli-yerlesim.png',
    caption: 'Mor çizgiler yatağa bağlı eşyaları, kesikli çizgiler önerilen yeni konumları gösterir.',
    steps: [
      <>Bir eşya seçip sağ panelden <strong>Bağlı yerleşim</strong> seçeneğini aç. Referansı ve onu izleyecek eşyayı seç. İki eşyayı <strong>Shift</strong> ile seçersen ilk eşya referans olur.</>,
      <>X ve Z için ortalama, kenar hizalama veya aralık seç. <strong>Kuralı önizle</strong> ile planı incele, ardından <strong>Kuralı kaydet</strong> seçeneğine bas.</>,
      <>Referansı sürükleyerek bağlı eşyaları birlikte taşı. Ölçü alanından değişiklik yaptığında <strong>Değişiklikleri uygula</strong> ile önizlemeyi onayla. Engel varsa kırmızı önizleme hangi bağlantının takıldığını gösterir.</>,
    ],
    note: 'Her eşyanın bir referansı olabilir. Kurallar etkin yerleşimle kaydedilir. Alternatif yerleşimi açıp bağlantıları ayrı düzenleyebilirsin.',
  },
  { id: 'replace', title: 'Bir eşyayı değiştir', image: 'esya-degistir.png',
    caption: 'Kesikli çizgi yeni yatağın izini gösterir. Sağ panel eski ve yeni ölçüleri, bağlı eşyaları ve geçişi karşılaştırır.',
    steps: [
      <>Planda bir eşya seç ve sağ panelde <strong>Eşyayı değiştir</strong> düğmesine bas. Hazır veya kişisel katalogdan bir model seçebilir ya da desteklenen bir GLB yükleyebilirsin.</>,
      <><strong>Ölçüler</strong> bölümünde modelin ölçülerini ya da mevcut ölçüleri seç. Plandaki kesikli önizlemeye, <strong>Bağlı eşyalar</strong> listesine ve geçiş boşluklarına bak.</>,
      <><strong>Uygula</strong> ile bu yerleşimi güncelle. <strong>Alternatif yerleşim olarak kaydet</strong> ile iki modeli ayrı düzenlerde sakla. Son değişiklik için <strong>Geri al</strong> düğmesini kullan.</>,
    ],
  },
  { id: 'stacked-wardrobes', title: 'Çekmeceli ve açık nişli gardıroplar', image: 'katli-gardiroplar.png',
    caption: 'Solda alt ve üst kapakların arasında iki dış çekmece, sağda komodin ile üst dolap arasında açık niş.',
    steps: [
      <><strong>Gardıroplar</strong> kategorisinden <strong>Dıştan çekmeceli gardırop</strong> veya <strong>Komodinli açık nişli gardırop</strong> seç.</>,
      <><strong>Gardırop bölümleri</strong> altında alt dolabın ve orta bölümün yüksekliğini ayarla. Dıştan çekmeceli modelde 1, 2 veya 3 çekmece seçebilirsin. Üst dolap kalan yüksekliği kullanır.</>,
      <><strong>Kapak açılımı</strong> ile alt veya üst kapağı ayrı ayrı düzenle. <strong>Malzeme → Yüzey</strong> listesinden alt kapakların, üst kapakların ve varsa çekmece önlerinin görünümünü ayrı ayarla.</>,
    ],
    localSteps: [
      <><strong>Kullanım provası</strong> bölümünden bir dış çekmece seç ve <strong>Tam açılımı dene</strong> düğmesine bas. Çekmeceye kapaklar kapalıyken erişebilirsin.</>,
    ] },
  { id: 'upper-cabinet-row', title: 'Üst dolap sırası oluştur', image: 'ust-dolap-sirasi.svg',
    caption: 'Üst dolap sırasındaki modüller ortak kotta hizalanır.',
    steps: [
      <>Aynı duvardaki iki yatak üstü dolabı planda veya <strong>Odadaki eşyalar</strong> listesinde Shift ile seç. <strong>Üst dolap sırası oluştur</strong> düğmesine bas.</>,
      <><strong>Modüller arası boşluk</strong> için 0 cm gir. Sol veya sağ ucu sabitle ya da bir yatağa ortala. Ortak alt kotu, modül enlerini ve kiriş boşluğunu duvar görünüşünde kontrol et.</>,
      <>Bir uca modül ekleyebilir, <strong>Komşu kapakları birlikte dene</strong> bölümünde açılımı sürgüyle izleyebilirsin. <strong>Sırayı uygula</strong> ile kaydet. Sonradan herhangi bir modülü seçerek sırayı açabilir veya <strong>Sırayı çöz</strong> ile dolapları ayrı düzenleyebilirsin.</>,
    ] },
  { id: 'wardrobe-run', title: 'Farklı modüllerle gardırop dizisi kur', image: 'moduler-gardirop-kontrolu.svg',
    caption: 'Örnek dizide üç modül bitişik durur. Her gövdenin ölçüsü ayrı düzenlenebilir.',
    steps: [
      <><strong>Gardıroplar → Modüler gardırop</strong> yolundan bir duvar seç. <strong>Modül tipi</strong> listesinden askılı, sürgülü, açık nişli veya dıştan çekmeceli bir modül belirle.</>,
      <>Ölçüleri gir ve modülleri <strong>Sola</strong> veya <strong>Sağa</strong> taşı. Duvar görünüşü, çakışmaları ve modülün ön yüzünü gösterir. Altta toplam genişliği ve duvarın bitişinde kalan mesafeyi gör.</>,
      <>Modül kartında kiriş payını, kapak ve çekmece açılımını ve geçişi kontrol et. Gerekirse boy önerisini uygula veya <strong>Modüller arası boşluk</strong> değerini artırıp açılımı tekrar kontrol et.</>,
    ],
    localSteps: [
      <><strong>Gardırop şablonları → Diziyi şablon olarak kaydet</strong> ile ölçüleri, sıra düzenini, iç düzeni ve malzemeleri yerel çalışma alanına kaydet. Başka bir odada yeni bir modüler gardırop açıp <strong>Şablonu taslağa yükle</strong> düğmesini kullan.</>,
    ] },
  { id: 'wardrobe-balance', title: 'Modül genişliğini dengele', image: 'gardirop-dengeleme.svg',
    caption: 'Anonim modül dizisinde orta gövde genişlerken iki komşu eşit genişlikte kalır.',
    steps: [
      <>Hazır gövdelerle doldurduğun dizide bir modül seç. <strong>Eşya özellikleri → Genişlik</strong> alanına yeni ölçüyü yazıp Enter’a bas. Dizi düzenleyicisinde aynı işlemi modülün <strong>En</strong> alanından yapabilirsin.</>,
      <><strong>Dengeleme önizlemesi</strong> tablosunda değişen enleri ve kolon önündeki derinliği karşılaştır. Planda kapak yayını ve ilk temas açısını incele.</>,
      <>Uygun bir taslağı <strong>Otomatik yerleşimi uygula</strong> ile kaydet. <strong>Vazgeç</strong> projedeki diziyi korur.</>,
    ] },
  { id: 'wardrobe-solutions', title: 'Kapak ve geçiş çözümlerini karşılaştır', image: 'gardirop-cozumleri.svg',
    caption: 'Menteşeli kapakta yay, sürgülü kapakta panelin hareket doğrultusu kontrol edilir.',
    steps: [
      <>Bir modül seçip <strong>Gardırop dizisini düzenle → Çözüm seçeneklerini karşılaştır</strong> düğmesine bas. Seçenekler arasında geçiş yaparak kapak açılımını, dolap önünü ve giriş yolunu planda incele.</>,
      <><strong>Yatağı da taşıyabilirim</strong> seçeneği 150 cm içinde yatağı ve bağlı eşyaları birlikte dener. Önerilen bir hareket varsa mor ok yönünü, kesikli mor çerçeve önceki konumu gösterir.</>,
      <>Uygun yerleşimi <strong>Seçeneği uygula</strong> ile kaydet. <strong>Düzenlemeye dön</strong> ile dengelediğin diziye dönebilirsin.</>,
    ] },
  { id: 'wardrobe-fill', title: 'Duvar alanını gardıropla doldur', image: 'otomatik-gardirop.svg',
    caption: 'Otomatik yerleşim seçili duvar aralığını modüllerle doldurur ve ön geçişi ayrıca kontrol eder.',
    steps: [
      <><strong>Gardıroplar → Modüler gardırop → Alanı doldur</strong> bölümünü aç. <strong>Planda iki nokta seç</strong> ile duvar aralığını işaretle veya başlangıç ve bitiş ölçülerini gir.</>,
      <>Gövdenin ulaşabileceği ön sınırı, ölçü profilini, üst payı ve <strong>Dolap önü geçiş hedefi</strong> değerini seç. Giriş açıklığı plandan gelir. <strong>Yerleşim önerilerini hazırla</strong> ile giriş rotasını ve dolap önü sonucunu ayrı ayrı kontrol et.</>,
      <>Bir taslağı açıp <strong>3B önizleme</strong> ile incele. 2B planda bir modülü seçerek tipini ve ölçülerini değiştir. <strong>Yeniden doldururken modülü sabitle</strong> seçeneğiyle beğendiğin parçayı koru.</>,
      <><strong>Hazır gövde ölçüleri</strong> ile 50, 75 ve 100 cm genişlikteki modüller bitişik dizilir. Örneğin köşede biten 260 cm alana 250 cm dolap sığar. Kalan 10 cm açık uçta kalır.</>,
      <>Kapak çarpıyorsa taslağı aç. <strong>Menteşe yönü önerisini uygula</strong> düğmesi, ters yönde tam açılabildiği doğrulanan kapağın menteşesini değiştirir. İki yön de engelliyse ve ray yolu açıksa sürgülü kapak önerilir. Geçiş sonuçlarını kontrol edip <strong>Otomatik yerleşimi uygula</strong> düğmesine bas.</>,
    ] },
  { id: 'design', title: 'Doku, ışık ve kamera', image: 'kamera.png',
    caption: 'Kamera panelindeki değerler yükseklik, bakış açısı ve lensi ayarlar.',
    steps: [
      <>Bir eşya seçip sağ panelde malzeme yüzeyini ve rengini değiştir. Duvar veya zemin yüzeylerini oda ve duvar özelliklerinden ayarla. <strong>Tasarımlar</strong> ile malzeme alternatiflerini kaydet.</>,
      <>Işık ayarlarında gündüz, sıcak veya akşam profilini dene. Katalogdan aplik ya da sarkıt eklediğinde gücü ve rengi seçili armatürün ayarlarından düzenle.</>,
      <><strong>3B görünüm → Kamera ayarları</strong> ile yüksekliği, yatay yönü, eğimi ve lensi ayarla. İsim girip <strong>Açıyı kaydet</strong> düğmesine bas.</>,
      <>Kamera ve ışık tutamaçları için <strong>Render objelerini düzenle</strong> seç. <strong>Duvarlar</strong> menüsünden bir duvarı gizle veya <strong>Ön duvarları otomatik gizle</strong> seçeneğini aç. Gizlenen duvara bağlı kolon ve kirişlerin konumunu ince bir kontur ve saydam yüzey gösterir.</>,
    ] },
  { id: 'material-maps', title: 'Yüzeye doku haritası ekle', image: 'pbr-yuzey.png',
    caption: 'Kumaş paneller seçiliyken ketenin pürüzlülük ve normal haritaları aynı yüzeye uygulanıyor.',
    steps: [
      <>Eşyayı seçip <strong>Malzeme → Yüzey</strong> listesinden düzenlemek istediğin parçayı seç. Duvar için plandan duvarı veya kaplama alanını seç.</>,
      <><strong>Kendi dokunu veya haritanı yükle</strong> bölümünden renk dokusunu, gri tonlu pürüzlülük haritasını ve OpenGL +Y normal haritasını ekle. Pürüzlülük haritasında açık alanlar daha mat görünür. Normal haritası dokumanın veya ahşap damarının kabartısını gösterir.</>,
      <><strong>Doku tekrar genişliği</strong> alanına desenin gerçek genişliğini cm olarak yaz. <strong>Doku ölçeği</strong> %100 iken haritalar bu genişlikte tekrarlanır. <strong>Kabartı</strong> ile derinlik hissini ayarlayıp <strong>Malzemeyi uygula</strong> düğmesine bas.</>,
    ] },
  { id: 'ready-materials', title: 'Hazır malzeme ve doku seç', image: 'hazir-malzeme.svg',
    caption: 'Hazır malzeme seçerken karttaki yüzey örneğini ve malzeme adını birlikte kullan.',
    steps: [
      <>Eşyayı seç ve <strong>Malzeme → Yüzey</strong> listesinden örtü, kapak veya döşeme gibi bir parça seç.</>,
      <><strong>Hazır malzemeler</strong> bölümünde kategoriyi açıp karttan seçim yap. Örneğin örtü için <strong>Dokuma pike</strong>, dolap kapağı için <strong>Mat lake</strong> veya <strong>Parlak lake</strong> seçebilirsin.</>,
      <><strong>Hazır dokular</strong> bölümünden desen seçip rengi, matlığı veya tekrar genişliğini ayarla. <strong>Malzemeyi uygula</strong> ile kaydet. Zemin ve duvar dokuları <strong>4K Cycles → Doku</strong> bölümünden de seçilebilir.</>,
    ] },
  { id: 'window-sill', title: 'Pencereye mermer denizlik ekle', image: 'mermer-denizlik.svg',
    caption: 'Denizlik pencerenin altında uzanır. Yan taşmalar genişlik ayarıyla değişir.',
    steps: [
      <>Plan üzerinden pencerenin bulunduğu duvarı seç. Sağ panelde <strong>Açıklıklar → Pencere</strong> bölümünü aç.</>,
      <><strong>Mermer denizlik ekle</strong> seçeneğini işaretle. Genişliği, derinliği ve kalınlığı girip beyaz veya gri mermeri seç. Derinliği duvarın dış yüzünden içe doğru ölç.</>,
      <>Panelde çakışan bir eşyanın adı görünürse denizliğin genişliğini veya derinliğini ayarla. Sonucu <strong>Duvar</strong>, <strong>3B görünüm</strong> veya <strong>Hızlı önizleme</strong> ile kontrol et.</>,
    ] },
  { id: 'material-pipette', title: 'Malzeme pipetini kullan', image: 'malzeme-pipeti.svg',
    caption: 'Kaynak dolabın yüzeyinden alınan malzeme hedef dolaba uygulanır.',
    steps: [
      <>Kaynak eşyayı seç, <strong>Malzeme → Yüzey</strong> listesinden parçayı belirle ve <strong>Malzemeyi al</strong> düğmesine bas. Pipet yüzeyin kayıtlı ayarlarını alır.</>,
      <>Hedef eşyada parçayı seçip <strong>Malzemeyi aktar</strong> düğmesine bas. Renk, matlık ve varsa doku haritaları birlikte aktarılır. Aynı malzemeyi birden fazla yüzeye uygulayabilirsin.</>,
      <>Duvarı, denizliği, pervazı veya süpürgeliği boyamak için kendi malzeme bölümünde aynı düğmeleri kullan. Bir aktarımı <strong>Geri al</strong> ile geri çevirebilirsin.</>,
    ] },
  { id: 'wall-trim', title: 'Pervaz ve süpürgelik ekle', image: 'pervaz-supurgelik.png',
    caption: 'Duvar 2 görünüşünde pervazın genişliği 7 cm, duvardan taşması 1,8 cm olarak ayarlanmış.',
    steps: [
      <>Plan üzerinden duvarı seç. <strong>Açıklıklar → Pencere → Pencere pervazı ekle</strong> seçeneğini işaretle ve ölçüleri gir. Mermer denizlik varsa pervaz yanlardan denizliğe kadar iner.</>,
      <>Aynı duvarın sağ panelinde <strong>Süpürgelik</strong> bölümünü aç. Yüksekliği ve odanın içine taşma mesafesini gir. Kapı açıklığında süpürgelik otomatik kesilir.</>,
      <><strong>Pervaz malzemesi</strong> veya <strong>Süpürgelik malzemesi</strong> bölümünden hazır malzeme seç ya da pipetle aktar. Sonucu <strong>Duvar</strong> görünüşünden ve <strong>3B görünümden</strong> incele.</>,
    ] },
  { id: 'trim-clearance', title: 'Duvar detayı çakışmasını kontrol et', image: 'duvar-detayi-cakismasi.svg',
    caption: 'Kesitte süpürgeliğin derinliği dolabın duvara yaklaşabileceği mesafeyi belirler.',
    steps: [
      <>Eşyayı seç. Sağ paneldeki çakışma uyarısında pervaz veya süpürgeliğin kapladığı mesafeyi gör. Çakışan bölüm 2B planda kırmızı işaretlenir. <strong>Duvar görünüşünde göster</strong> ile ilgili duvarı aç.</>,
      <><strong>Öne almayı önizle</strong> ile hareket yönündeki boşluğu, kayıtlı geçişleri ve varsa taşınacak bağlı eşyaları incele. Uygun bir öneriyi <strong>Hareketi uygula</strong> ile kaydet.</>,
      <>Gardırop duvara yakın kalacaksa duvarı seçip <strong>Süpürgelik → Süpürgelik boşlukları → Boşluk ekle</strong> yolunu kullan. Boşluğun başlangıcını duvarın başlangıcından ölç ve kesilecek uzunluğu gir.</>,
    ] },
  { id: 'batch-baseboard', title: 'Süpürgeliği birden çok duvara uygula', image: 'supurgelik-toplu-uygulama.svg',
    caption: 'Yeşil kenarlar örnek odada aynı süpürgeliğin uygulandığı iki duvarı gösterir.',
    steps: [
      <>Kaynak duvarda <strong>Süpürgelik</strong> bölümünden ölçü ve malzemeyi ayarla.</>,
      <><strong>Diğer duvarlara uygula</strong> bölümünden hedef duvarları seç ve <strong>Seçili duvarlara uygula</strong> düğmesine bas. Seçili duvarların mevcut ölçü ve malzemesi güncellenir, kendi boşlukları korunur.</>,
      <>Toplu işlemi tek adımda <strong>Geri al</strong> ile geri çevirebilirsin. Bir duvarın ölçüsünü, malzemesini veya boşluklarını ayrıca düzenlemek için duvarı seç.</>,
    ] },
  { id: 'ambience', title: 'Gündüz ve akşam ambiyansı', image: 'ambiyans.svg',
    caption: 'Aynı kamera için gündüz ve akşam ışığını ayrı ayrı kaydedebilirsin.',
    steps: [
      <><strong>4K Cycles → Işık</strong> bölümünde <strong>Gündüz</strong> veya <strong>Sıcak akşam</strong> seç. Pencere ışığının yoğunluğunu, kaynak boyutunu ve sıcaklığını ayarla.</>,
      <>Armatür adını açıp o profil için ışığı yak, gücünü, sıcaklığını ve kaynak çapını düzenle. <strong>Pozlama</strong> görüntünün parlaklığını, <strong>Beyaz dengesi</strong> beyaz yüzeylerin tonunu etkiler. Ayarları projeye kaydet.</>,
    ],
    localSteps: [
      <><strong>Gündüz ve akşamı karşılaştır</strong> ile iki önizlemeyi aynı kadrajdan al. Bir görüntünün altından ışığını seç ve <strong>4K render al</strong> düğmesine bas.</>,
      <>Ayarları bir kamera ve yerleşimle birlikte saklamak için <strong>Sahneler → Sahne ekle</strong> yolunu kullan. Tamamlanan sonuçlara <strong>Galeri</strong> üzerinden dön.</>,
    ] },
  { id: 'render-surroundings', title: 'Sahne çevresi ve yatak tekstilleri', image: 'sahne-cevresi.png',
    caption: 'Kapı arkasındaki koridor, pencere manzarasının parlaklığı ve yatak tekstilleri aynı sekmede ayarlanır.',
    steps: [
      <><strong>4K Cycles → Sahne çevresi</strong> sekmesini aç. <strong>Koridoru göster</strong> seçeneğini açıp kapıyı seç. Koridor için derinlik, duvar rengi ve ışık gücü gir.</>,
      <><strong>Akşam manzarasını göster</strong> ile pencere dışını ayarla. Manzaranın parlaklığı bu sekmede, odadaki pencere ışığının gücü <strong>Işık</strong> sekmesinde ayarlanır.</>,
      <><strong>Örtü sarkması ve dikişleri göster</strong> seçeneği, ölçülü yatakların örtü ve yastık ayrıntılarını Cycles görüntüsüne ekler. <strong>Hızlı önizleme</strong> ile kapı açıklığını, aynayı ve örtü kenarını kontrol et.</>,
      <><strong>Ayarları projeye kaydet</strong> ile bu görünümü sakla. <strong>Sahneler</strong> bölümünde aynı kadraj için farklı çevre ve tekstil ayarları kaydedebilirsin.</>,
    ] },
  { id: 'render', title: 'Render al ve görüntüle', image: 'render.png',
    caption: 'Sahneler bölümünde kamera ve ışık ayarlarını seç. Sonuçlar Galeri sekmesine gelir.',
    steps: [
      <><strong>4K Cycles</strong> penceresinde kamera ve ışığı kontrol et. Web sürümünde projeyi indirip Windows paketinde aç. Windows sürümünde kadrajı hızlı denemek için önizleme al. Son görüntü için <strong>4K render al</strong> seç.</>,
    ],
    localSteps: [
      <>Birden fazla kadraj için <strong>Sahneler → Sahne ekle</strong> ile yerleşimi, tasarımı, kayıtlı kamerayı ve ışığı seç. Sahneyi kaydet, çıktı türünü belirle ve <strong>Seçili sahneleri kuyruğa al</strong> düğmesine bas.</>,
      <><strong>Galeri</strong> sekmesinde sonucu aç veya PNG’yi indir. Aynı kamera açısıyla alınan iki görüntüyü burada karşılaştırabilirsin.</>,
      <>Odayı düzenlerken içeride gezmek için <strong>3B görünüm → Odayı dolaş</strong> seç. 360° çıktı gerektiğinde <strong>4K Cycles → Kamera → 360° panorama (isteğe bağlı)</strong> bölümünü aç. Kayıtlı bir panoramayı <strong>Galeri → 360° görüntüle</strong> ile çevirerek incele.</>,
      <>Yerel 4K Cycles için Blender kullanılabilir olmalı. Hızlı tarayıcı çıktısı için <strong>3B görünüm → PNG indir</strong> seç.</>,
    ],
  },
  { id: 'mounting', title: 'Ölç ve montajı kontrol et', image: 'montaj.svg',
    caption: 'Montaj öncesinde kirişin alt kotu ile dolap üst kotu karşılaştırılır.',
    steps: [
      <>2B planda <strong>Ölçüler</strong> bölümünü aç. Geçiş, iki eşya arası mesafe veya kiriş altı boşluğu kaydet.</>,
      <><strong>Kesit</strong> görünümünde yeni kesit oluştur. Planda bir çizgi konumu seçerek dolabın üst kotunu ve kiriş altındaki boşluğu gör.</>,
      <><strong>Proje → Montaj Öncesi Kontrol</strong> ile kapak, çekmece, dolap kaldırma ve bekleyen saha ölçülerini incele. Bulgudaki düğmeyle ilgili ayarı aç.</>,
    ],
  },
  { id: 'files', title: 'Sürüm kaydet ve teslim et', image: 'surum.png',
    caption: 'Sürüm karşılaştırması iki planı aynı ölçekte gösterir. Bir bulgudan ilgili eşyaya veya kesite gidebilirsin.',
    steps: [
      <><strong>Proje → Boş oda kopyası oluştur</strong> ile mevcut oda planından eşyasız bir çalışma aç. Oda ölçüleri, açıklıklar ve çıkıntılar yeni kopyaya geçer. Eşyalı projeye <strong>Yerel projeler</strong> menüsünden dönebilirsin.</>,
      <><strong>Proje → Yerel projeler</strong> içinden sürüm kaydet veya kayıtlı bir sürümü çalışma kopyası olarak aç.</>,
      <><strong>Sürümleri karşılaştır</strong> ile önceki kayıt ve mevcut çalışma arasındaki konum, ölçü ve montaj farklarını incele.</>,
      <><strong>Proje → Teslim paketi oluştur</strong> ekranında sürümü ve eşleşen PNG’leri seç. Önceki bir sürüm seçersen değişiklik özeti montaj PDF’sine eklenir.</>,
      <>Başka bilgisayarda ZIP’i çıkar. MyHome’da <strong>Proje → Projeyi aç</strong> ile <strong>Proje.workspace.json</strong> dosyasını yükle.</>,
    ],
  },
] satisfies (Topic & { id: string })[]

export type HelpTopic = 'room' | 'items' | 'focus' | 'smart' | 'linked' | 'replace' | 'design' | 'render' | 'mounting' | 'files'
const personalTopics = ['mounting', 'files']

export default function HelpDialog({ initialTopic, personal, close }: { initialTopic: HelpTopic; personal: boolean; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [selected, setSelected] = useState<string>(initialTopic)
  const scroll = useRef<HTMLElement>(null)
  const available: Topic[] = personal ? topics : topics.filter(topic => !personalTopics.includes(topic.id))
  const topic = available.find(topic => topic.id === selected) ?? available[0]
  const image = `${import.meta.env.BASE_URL}help/${topic.image}`
  useEffect(() => {
    const modal = dialog.current
    modal?.showModal()
    return () => modal?.close()
  }, [])
  return <dialog ref={dialog} className="render-dialog guide-dialog" aria-labelledby="guide-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header"><h2 id="guide-title">MyHome kullanım rehberi</h2>
      <button className="icon" type="button" aria-label="Rehberi kapat" onClick={close}><X size={19} /></button></header>
    <div className="guide-body">
      <nav aria-label="Rehber konuları">
        {available.map(entry => <button key={entry.id} type="button" aria-current={topic.id === entry.id ? 'true' : undefined}
          onClick={() => { setSelected(entry.id); scroll.current?.scrollTo({ top: 0 }) }}>{entry.title}</button>)}
      </nav>
      <article ref={scroll} aria-label={topic.title}>
        <h3>{topic.title}</h3>
        <ol>{[...topic.steps, ...(personal ? topic.localSteps ?? [] : [])].map((step, index) => <li key={index}>{step}</li>)}</ol>
        {topic.note && <p className="guide-note">{topic.note}</p>}
        <figure>
          <img src={image} alt={topic.caption} decoding="async" />
          <figcaption><span>{topic.caption}</span>
            <a href={image} target="_blank" rel="noreferrer">Görseli büyüt <ArrowUpRight size={14} /></a></figcaption>
        </figure>
      </article>
    </div>
  </dialog>
}
