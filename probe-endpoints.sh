for endpoint in "/api/secrets" "/api/profile" "/api/ai/models" "/dev/poll" "/api/files/list"; do
  echo -n "$endpoint: "
  curl -s -o /dev/null -w "%{http_code}" "https://cybernetics-pqvr.onrender.com$endpoint"
  echo
done
