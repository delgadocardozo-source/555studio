import { describe, expect, it } from "vitest";
import {
  emptyWashRecipes,
  expandWashConsumption,
  recipeHasLines,
  sanitizeRecipeLines,
} from "../shared/washRecipe";

describe("wash recipe consumption", () => {
  it("expande cantidades por tipo de vehículo", () => {
    const recipes = emptyWashRecipes();
    recipes.auto = [
      { itemId: 1, quantityPerVehicle: 2 },
      { itemId: 2, quantityPerVehicle: 1 },
    ];
    recipes.camioneta = [{ itemId: 1, quantityPerVehicle: 3 }];

    const plan = expandWashConsumption(recipes, [
      { type: "auto" },
      { type: "auto" },
      { type: "camioneta" },
    ]);

    const shampoo = plan.find((p) => p.itemId === 1);
    const panos = plan.find((p) => p.itemId === 2);
    expect(shampoo?.quantity).toBe(2 * 2 + 3); // 2 autos×2 + 1 camioneta×3
    expect(panos?.quantity).toBe(2); // solo autos
  });

  it("sanitiza líneas y detecta receta vacía", () => {
    expect(recipeHasLines(emptyWashRecipes())).toBe(false);
    const lines = sanitizeRecipeLines([
      { itemId: 1, quantityPerVehicle: 2 },
      { itemId: 1, quantityPerVehicle: 1 },
      { itemId: 0, quantityPerVehicle: 5 },
      { itemId: 2, quantityPerVehicle: -1 },
    ]);
    expect(lines).toEqual([{ itemId: 1, quantityPerVehicle: 3 }]);
    expect(recipeHasLines({ auto: lines, camioneta: [] })).toBe(true);
  });
});
