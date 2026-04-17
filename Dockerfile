FROM node:25.9.0

WORKDIR /usr/src/app



# Copy package configurations
COPY package*.json ./

# Install dependencies
RUN npm install

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy application source
COPY . .

# Expose API port
EXPOSE 5000

# Start development server
CMD ["npm", "run", "dev"]
