import express from "express";
import entityController from "./entityController.js";

const router = express.Router();

// Base route - /api/:system/entities

// GET /entities/summary - Get entity summaries for list display
router.get("/summary", entityController.getEntitySummaries);

// GET /entities - Get all entities
router.get("/", entityController.getAllEntities);

// GET /entities/:id - Get entity by ID
router.get("/:id", entityController.getEntityById);

// POST /entities - Insert a new entity
router.post("/", entityController.insertEntity);

// PUT /entities/:id - Update an entity
router.put("/:id", entityController.updateEntity);

// DELETE /entities/:id - Delete an entity
router.delete("/:id", entityController.deleteEntity);

export default router;