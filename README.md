# FactoryHub / Packing Kiosk

## HTTPS (mkcert)

Aplikacja automatycznie uruchomi HTTPS, jeżeli:

1. ustawisz zmienne `SSL_CERT_PATH` i `SSL_KEY_PATH`, **albo**
2. w katalogu projektu będą pliki mkcert o nazwie `localhost+*.pem` i `localhost+*-key.pem`.

Przykład dla Twojego przypadku:

```powershell
.\mkcert.exe localhost 10.108.146.137
```

Po wygenerowaniu certyfikatu (`localhost+1.pem`) i klucza (`localhost+1-key.pem`) uruchom serwer jak zwykle (`npm start`) z katalogu projektu.

Jeśli pliki leżą gdzie indziej, ustaw:

```powershell
$env:SSL_CERT_PATH="C:\sciezka\localhost+1.pem"
$env:SSL_KEY_PATH="C:\sciezka\localhost+1-key.pem"
npm start
```
