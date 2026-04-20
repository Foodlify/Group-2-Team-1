Project Structure 

src/
  config/
    env.js
    logger.js

  modules/
    user/
      user.controller.js
      user.service.js
      user.repository.js
      user.model.js
      user.routes.js
      user.validation.js

  middlewares/
    error.middleware.js
    auth.middleware.js

  utils/
    response.js
    asyncHandler.js

  routes/
    index.js

  app.js
  server.js

tests/

.env.example
Dockerfile
docker-compose.yml
package.json
README.md