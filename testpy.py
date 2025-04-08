import requests

proxy = {
    "http": "https://u132f6e3756ae05c4-zone-custom-region-us-session-cBum3AnH0-sessTime-120:u132f6e3756ae05c4@43.159.28.126:2334"
}

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

try:
    response = requests.get("https://www.reddit.com", headers=headers, proxies=proxy, timeout=10)
    print("Status Code:", response.status_code)
    if "reddit" in response.text.lower():
        print("✅ Proxy hoạt động và truy cập Reddit được.")
    else:
        print("⚠️ Proxy kết nối được nhưng có thể bị chặn hoặc redirect.")
except requests.exceptions.RequestException as e:
    print("❌ Không kết nối được qua proxy:", e)
