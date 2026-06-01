# ShortMaker

ShortMaker, yatay videolardan belirlediğiniz zaman aralıklarına göre birden fazla dikey short üreten lokal bir web uygulamasıdır. Arayüzden videoyu yükleyip başlangıç ve bitiş zamanlarını girersiniz; uygulama her aralık için ayrı çıktı üretir, önizleme gösterir ve indirme linki sunar.

## Özellikler

- Tek videodan birden fazla short üretme
- `HH:MM:SS` formatında zaman aralığı girişi
- Lokal çalışma, bulut servisi gerektirmez
- `ffmpeg` ile 16:9 videoyu 9:16 formata dönüştürme
- Üretilen videolar için önizleme ve indirme
- Daha önce üretilmiş çıktıları arayüzde tekrar listeleme

## Kullanılan Teknolojiler

- Python
- FastAPI
- Uvicorn
- FFmpeg
- HTML / CSS / jQuery

## Gereksinimler

Başlamadan önce şunların kurulu olması gerekir:

- Python 3.10+
- `ffmpeg` ve sistem `PATH` değişkenine eklenmiş olması

`ffmpeg` kurulumunu doğrulamak için:

```bash
ffmpeg -version
```

## Kurulum

1. Repoyu klonlayın:

```bash
git clone <repo-url>
cd shortmake
```

2. Gerekli Python paketlerini yükleyin:

```bash
pip install fastapi uvicorn python-multipart
```

3. Uygulamayı başlatın:

```bash
python app.py
```

4. Tarayıcıda şu adresi açın:

```text
http://127.0.0.1:8000
```

## Kullanım

1. Videoyu sürükleyip bırakın veya seçin.
2. Short almak istediğiniz başlangıç ve bitiş zamanlarını girin.
3. Gerekirse `+ Ekle` ile yeni aralıklar ekleyin.
4. `Short Oluştur` butonuna basın.
5. Sağ panelden oluşan videoları önizleyin ve indirin.

Notlar:

- Aynı anda en fazla 5 aralık eklenebilir.
- Çıktılar `outputs/` klasörüne kaydedilir.
- Geçici yüklenen dosyalar işlem sonunda temizlenir.

## Proje Yapısı

```text
shortmake/
├── app.py        # FastAPI backend ve ffmpeg işlem akışı
├── index.html    # Arayüz
├── style.css     # Tasarım
├── app.js        # Frontend etkileşimleri
├── uploads/      # Geçici yüklenen videolar
└── outputs/      # Üretilen short videolar
```

## API Uçları

- `GET /` : Ana arayüz
- `GET /outputs` : Mevcut çıktıların listesi
- `POST /process-multiple` : Video ve zaman aralıklarını işleyip short üretir
- `GET /preview/{file_id}` : Çıktı videosunu önizleme için sunar
- `GET /download/{file_id}` : Çıktı videosunu indirir

## Nasıl Çalışır?

Uygulama yüklenen videoyu bir kez sunucuya kaydeder. Ardından her zaman aralığı için `ffmpeg` çalıştırarak ilgili bölümü keser, videoyu `1080x1920` dikey formata dönüştürür ve sonucu `outputs/` klasörüne kaydeder.

Kullanılan video filtresi:

```text
scale=1080:-2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black
```

Bu sayede yatay görüntü bozulmadan dikey kadraja ortalanır; boş alanlar siyah padding ile tamamlanır.

## Geliştirme Fikirleri

- Dosya boyutu ve süre doğrulama
- İşlem geçmişi / çıktı silme özelliği
- Farklı export preset seçenekleri
- Otomatik altyazı veya watermark desteği
- Gerçek zamanlı işlem ilerleme takibi

## Lisans
