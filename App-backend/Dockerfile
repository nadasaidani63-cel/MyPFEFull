FROM node:20-slim

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

RUN python3 -m pip install --break-system-packages scikit-learn==1.4.2 joblib==1.3.2 numpy==1.26.4

COPY . .

ENV AI_PYTHON_EXECUTABLE=python3

EXPOSE 5000

CMD ["node", "server.js"]
