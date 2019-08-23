/**
 * Concept: Move X first, then move Y. Don't mix or modify in-between or receive unexpected results / undefined behavior.
 *
 * Assumptions:
 *
 * - The X axis points to the right
 * - The Y axis points down
 * - The anchor of sprites is always in the top left
 * - Sprites have a valid x, y, width and height value
 */
class TileEngineHelper {
    /**
     * @param engine {TileEngine}
     */
    constructor(engine) {
        this.debugTexts = null;
        this.debugSprites = null;
        this.engine = engine;
        this.collision = [];
    }

    /**
     * @deprecated
     * @param textList {[]}
     * @param spriteList {[]}
     */
    setDebugObjects(textList, spriteList) {
        this.debugTexts = textList;
        this.debugSprites = spriteList;
    }

    /**
     * @param layerName Layer name.
     * @param tileId Tile ID in the layer.
     * @param isSolid bool Whether the tile is solid.
     *
     * TODO Support callbacks as `isSolid` to respond to collisions and enable custom collision behaviors.
     *      Example: A fast running player is allowed to destroy specific walls on contact (see Metroid).
     */
    setTileCollisionHandler(layerName, tileId, isSolid) {
        if (this.collision[layerName] === undefined) {
            this.collision[layerName] = [];
        }

        this.collision[layerName][tileId] = isSolid;
    }

    /**
     * Stores a backup of the current x, y, width and height information in `sprite.previous`.
     * This object is required to resolve collisions.
     * Update the new x, y, width and height value afterwards.
     *
     * The previous position is required to check for obstacles between the old and targeted new position.
     *
     * @param sprite Sprite
     * @see solveSpriteMovementX
     * @see solveSpriteMovementXY
     * @see solveSpriteMovementY
     */
    static prepareMovement(sprite) {
        if (!sprite.previous) {
            sprite.previous = {};
        }

        let previous = sprite.previous;

        previous.x = sprite.x;
        previous.y = sprite.y;
        previous.width = sprite.width;
        previous.height = sprite.height;
    }

    /**
     * Solves the X direction before solving the Y direction.
     *
     * @param sprite {Sprite}
     */
    solveSpriteMovementXY(sprite) {
        this.solveSpriteMovementX(sprite);
        this.solveSpriteMovementY(sprite);
    }

    /**
     * @param sprite Sprite
     */
    solveSpriteMovementX(sprite) {
        let previous = sprite.previous;

        if (sprite.y !== previous.y || sprite.height !== previous.height) {
            throw 'Expected no change on Y axis.';
        }

        let diff = sprite.x - previous.x;

        sprite.movesLeft = diff < 0;
        sprite.movesRight = diff > 0;


        if (diff) {
            sprite.looksLeft = diff < 0;
            sprite.looksRight = diff > 0;

            let range = this.getOccupiedTilesByRectRectBoundingBox(sprite, previous);

            // Collide with left tile.
            if (sprite.movesLeft) {
                let tile = this.getRightMostTileInRange(range, 'ground');

                if (this.debugTexts) this.debugTexts.push('rightMostTile=' + JSON.stringify(tile));

                if (tile) {
                    if (this.debugSprites) debugSprites.push(this.createDebugSprite(tile.x, tile.y));

                    let wallRight = (tile.x + 1) * this.engine.tilewidth;

                    if (wallRight > sprite.x) {
                        sprite.x = wallRight
                    }
                }
            }

            // Collide with right tile.
            else {
                let tile = this.getLeftMostTileInRange(range, 'ground');

                if (this.debugTexts) this.debugTexts.push('leftMostTile=' + JSON.stringify(tile));

                if (tile) {
                    if (this.debugSprites) this.debugSprites.push(this.createDebugSprite(tile.x, tile.y));

                    let wallLeft = tile.x * this.engine.tilewidth;

                    if (wallLeft < sprite.x + sprite.width) {
                        sprite.x = wallLeft - sprite.width
                    }
                }
            }
        }
    }

    solveSpriteMovementY(sprite) {
        let previous = sprite.previous;

        if (sprite.x !== previous.x || sprite.width !== previous.width) {
            throw 'Expected no change on X axis.';
        }

        // A sprite is only standing on ground,
        // when it collides with the tile below.
        sprite.isOnGround = false;

        let diff = sprite.previous.y - sprite.y;

        sprite.movesUp = diff > 0;
        sprite.movesDown = diff < 0;

        // Collide with ground.
        if (diff) {
            let range = this.getOccupiedTilesByRectRectBoundingBox(sprite, sprite.previous);

            if (sprite.movesDown) {
                let tile = this.getTopMostTileInRange(range, 'ground');

                if (this.debugTexts) this.debugTexts.push('topMostTile=' + JSON.stringify(tile));

                if (tile) {
                    if (this.debugSprites) this.debugSprites.push(this.createDebugSprite(tile.x, tile.y));

                    let groundY = tile.y * this.engine.tileheight - sprite.height;
                    if (sprite.y > groundY) {
                        sprite.y = groundY;

                        // The sprite is now standing on a solid tile.
                        sprite.isOnGround = true;
                        sprite.dy = 0;
                    }
                }
            }

            // Collide with ceiling.
            else {
                let tile = this.getBottomMostTileInRange(range, 'ground');

                if (this.debugTexts) this.debugTexts.push('bottomMostTile=' + JSON.stringify(tile));

                if (tile) {
                    // +1 is required because we want to know the edge at the tile's bottom.
                    let ceilingY = (tile.y + 1) * this.engine.tileheight;

                    if (this.debugSprites) this.debugSprites.push(this.createDebugSprite(tile.x, tile.y));

                    if (sprite.y < ceilingY) {
                        sprite.y = ceilingY;
                        sprite.dy = 0; // Prevents sticking to the ceiling until gravity is integrated often enough to fall.
                    }
                }
            }
        }
    }

    /**
     * @param rect {{x: Number, y: Number, width: Number, height: Number}} Generic Rectangle, e.g. a {{Sprite}}
     * @returns {{yMin: Number, yMax: Number, xMax: Number, xMin: Number}}
     */
    getOccupiedTilesByRect(rect) {
        // Local variables to help the JS minimizer.
        let engine = this.engine;
        let tileWidth = engine.tilewidth;
        let tileHeight = engine.tileheight;

        let xMax = (rect.x + rect.width) / tileWidth | 0;
        let yMax = (rect.y + rect.height) / tileHeight | 0;

        // The tile on the right should not be occupied,
        // when the rectangle is only touching its edge.
        if ((rect.x + rect.width) % tileWidth === 0) {
            xMax -= 1;
        }

        // The tile on the bottom should not be occupied,
        // when the rectangle is only touching its edge.
        if ((rect.y + rect.height) % tileHeight === 0) {
            yMax -= 1;
        }

        return {
            xMin: rect.x / tileWidth | 0,
            xMax: xMax,
            yMin: rect.y / tileHeight | 0,
            yMax: yMax,
        }
    }

    /**
     * @param rectA {{x: Number, y: Number, width: Number, height: Number}} Generic Rectangle, e.g. a {{Sprite}}
     * @param rectB {{x: Number, y: Number, width: Number, height: Number}} Generic Rectangle, e.g. a {{Sprite}}
     * @returns {{yMin: Number, yMax: Number, xMax: Number, xMin: Number}} The bounding box spanning both rectangles.
     */
    getOccupiedTilesByRectRectBoundingBox(rectA, rectB) {
        let occupiedTilesByA = this.getOccupiedTilesByRect(rectA);
        let occupiedTilesByB = this.getOccupiedTilesByRect(rectB);

        return {
            xMin: Math.min(occupiedTilesByA.xMin, occupiedTilesByB.xMin),
            xMax: Math.max(occupiedTilesByA.xMax, occupiedTilesByB.xMax),
            yMin: Math.min(occupiedTilesByA.yMin, occupiedTilesByB.yMin),
            yMax: Math.max(occupiedTilesByA.yMax, occupiedTilesByB.yMax),
        }
    }

    /**
     * @param range {{yMin: Number, yMax: Number, xMax: Number, xMin: Number}}
     * @param layerName Name of the tile layer.
     * @returns {{x: Number, y: Number}|null} The left most tile (or one of the left most tiles).
     */
    getLeftMostTileInRange(range, layerName) {
        for (let x = range.xMin; x <= range.xMax; ++x) {
            for (let y = range.yMin; y <= range.yMax; ++y) {
                let c = this.isSolidTile(layerName, x, y);
                if (c) return c;
            }
        }

        return null;
    }

    /**
     * @param range {{yMin: Number, yMax: Number, xMax: Number, xMin: Number}}
     * @param layerName Name of the tile layer.
     * @returns {{x: Number, y: Number}|null} The right most tile (or one of the right most tiles).
     */
    getRightMostTileInRange(range, layerName) {
        for (let x = range.xMax; x >= range.xMin; --x) {
            for (let y = range.yMin; y <= range.yMax; ++y) {
                let c = this.isSolidTile(layerName, x, y);
                if (c) return c;
            }
        }

        return null;
    }

    /**
     * @param range {{yMin: Number, yMax: Number, xMax: Number, xMin: Number}}
     * @param layerName Name of the tile layer.
     * @returns {{x: Number, y: Number}|null} The top most tile (or one of the top most tiles).
     */
    getTopMostTileInRange(range, layerName) {
        for (let y = range.yMax; y >= range.yMin; --y) {
            for (let x = range.xMin; x <= range.xMax; ++x) {
                let c = this.isSolidTile(layerName, x, y);
                if (c) return c;
            }
        }

        return null;
    }

    /**
     * @param range {{yMin: Number, yMax: Number, xMax: Number, xMin: Number}}
     * @param layerName Name of the tile layer.
     * @returns {{x: Number, y: Number}|null} The right most tile (or one of the right most tiles).
     */
    getBottomMostTileInRange(range, layerName) {
        for (let y = range.yMin; y <= range.yMax; ++y) {
            for (let x = range.xMin; x <= range.xMax; ++x) {
                let c = this.isSolidTile(layerName, x, y);
                if (c) return c;
            }
        }

        return null;
    }

    /**
     * @param l Name of the layer.
     * @param x
     * @param y
     * @returns {null|{x: Number, y: Number}}
     */
    isSolidTile(l, x, y) {
        let tileType = this.engine.tileAtLayer(l, {col: x, row: y});

        if (this.collision[l] && this.collision[l][tileType]) {
            return {x: x, y: y};
        }

        return null;
    }

    /**
     * @deprecated
     * @param x
     * @param y
     * @returns {Sprite}
     */
    createDebugSprite(x, y) {
        return kontra.Sprite({
            x: x * this.engine.tilewidth,
            y: y * this.engine.tileheight,
            width: this.engine.tilewidth,
            height: this.engine.tileheight,
            color: "#ffff00a0",
        })
    }

    /**
     * Kontra's TileEngine doesn't handle sprites.
     * Therefore rendering a sprite doesn't place the sprite inside the tile world
     * but relative to the view port of the canvas.
     * This method renders the sprite on the correct position in the tile world.
     *
     * @param sprite
     */
    renderSpriteGlobally(sprite) {
        sprite.x -= this.engine.sx;
        sprite.y -= this.engine.sy;

        sprite.render();

        sprite.x += this.engine.sx;
        sprite.y += this.engine.sy;
    }
}
