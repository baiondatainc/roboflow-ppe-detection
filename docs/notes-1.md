



curl -I "https://serverless.roboflow.com/ppedetection-yeyj8/workflows/detect-count-and-visualize?api_key=jlY9qpN7ZBI9Ay5V1xEW"




curl --location 'https://serverless.roboflow.com/ppedetection-yeyj8/workflows/detect-count-and-visualize' \
--header 'Content-Type: application/json' \
--data '{
    "api_key": "jlY9qpN7ZBI9Ay5V1xEW",
    "inputs": {
        "image": {"type": "url", "value": "@test-frame-small.jpg"}
    }
}'



curl --location 'https://serverless.roboflow.com/ppedetection-yeyj8/workflows/detect-count-and-visualize' \
--header 'Content-Type: application/json' \
--data '{
  "api_key": "jlY9qpN7ZBI9Ay5V1xEW",
  "inputs": {
    "image": {
      "type": "url",
      "value": "https://cdn.pixabay.com/photo/2015/11/17/13/13/puppy-1047521_1280.jpg"
    }
  }
}'


curl --location 'https://serverless.roboflow.com/ppedetection-yeyj8/workflows/detect-count-and-visualize' \
--header 'Content-Type: application/json' \
--data '{
  "api_key": "YOUR_API_KEY",
  "inputs": {
    "image": {
      "type": "url",
      "value": "https://media.roboflow.com/notebooks/examples/dog.jpg"
    }
  }
}'
