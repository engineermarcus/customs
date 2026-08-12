 ffuf -u "http://localhost:3000/FUZZ" -w ssrf-wordlist.txt -c -mc 200,301,302,400,401,403,405,500
