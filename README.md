# PDA barcode reader helper 

This is a tiny Node.js server with a single endpoint that appends lines to `valores.txt` in the format:

```
Item|Qtty|Date
Item|Qtty|Date
```

This was designed to work with a PDA device that scans barcodes and sends the data via the simple web interface.

## Run

- Ensure Node.js 16+ is installed.
- From this folder, start the server:

```sh
npm start
```

The server listens on port `3000` by default. Override with `PORT=8080` if needed.

## Usage

Open the website in your browser:

- http://localhost:3000/

It provides a simple, mobile-friendly form to submit item code and quantity. It calls the same API under the hood and shows the result.

Alternatively, append an item using a GET request directly:

```
GET /addItem?code=ABC123&qtty=5&date=1234567890
```

Example using curl:

```sh
curl "http://localhost:3000/addItem?code=ABC123&qtty=5&date=1234567890"
```

This will append a line to `valores.txt`:

```
ABC123|5
```

Notes:
- `code` is treated as a string. Pipes (`|`) and newlines are sanitized.
- `qtty` is parsed as a number.
- `date` is an optional parameter representing a timestamp in milliseconds. If not provided, the current timestamp is used.
- File path: `valores.txt` in the same directory as `server.js`.

### Notes for deployment

- Static files are served from `public/`.
- Health check endpoint: `GET /health` returns `{ ok: true }`.
