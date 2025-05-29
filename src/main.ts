import Phaser from "phaser";
import { Client, Room } from "colyseus.js";

// =============================================================================
// COLYSEUS CONNECTION
// =============================================================================

interface ChessRoomState {
  pieces: any[];
  players: Map<string, any>;
  currentTurn: 'white' | 'black';
  gameStatus: string;
  selectedPiecePlayer: string;
  selectedRow: number;
  selectedCol: number;
  winner: string;
  gameStarted: boolean;
  lastMoveTime: number;
}

let client: Client;
let room: Room<ChessRoomState>;
let playerColor: 'white' | 'black' | 'spectator';
let playerSessionId: string = '';

// =============================================================================
// PIECE CLASSES
// =============================================================================

abstract class Piece {
  public hasMoved = false;

  constructor(
    public color: 'white' | 'black',
    public row: number,
    public col: number
  ) { }

  abstract getType(): string;
  abstract getValidMoves(board: ChessBoard): { row: number; col: number }[];
  abstract getImageKey(): string;

  isOpponent(other: Piece): boolean {
    return this.color !== other.color;
  }

  moveTo(row: number, col: number): void {
    this.row = row;
    this.col = col;
    this.hasMoved = true;
  }
}

class Pawn extends Piece {
  getType(): string { return 'pawn'; }
  getImageKey(): string { return `pawn_${this.color === 'white' ? 'w' : 'b'}`; }

  getValidMoves(board: ChessBoard): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const direction = this.color === 'white' ? -1 : 1;
    const startingRow = this.color === 'white' ? 6 : 1;

    // Forward move
    const oneForward = { row: this.row + direction, col: this.col };
    if (board.isValidPosition(oneForward) && !board.getPiece(oneForward.row, oneForward.col)) {
      moves.push(oneForward);

      // Two squares forward from starting position
      if (this.row === startingRow) {
        const twoForward = { row: this.row + 2 * direction, col: this.col };
        if (board.isValidPosition(twoForward) && !board.getPiece(twoForward.row, twoForward.col)) {
          moves.push(twoForward);
        }
      }
    }
    const captureLeft = { row: this.row + direction, col: this.col - 1 };
    const captureRight = { row: this.row + direction, col: this.col + 1 };

    for (const capturePos of [captureLeft, captureRight]) {
      if (board.isValidPosition(capturePos)) {
        const piece = board.getPiece(capturePos.row, capturePos.col);
        if (piece && this.isOpponent(piece)) {
          moves.push(capturePos);
        }
      }
    }

    return moves;
  }
}

class Rook extends Piece {
  getType(): string { return 'rook'; }
  getImageKey(): string { return `rook_${this.color === 'white' ? 'w' : 'b'}`; }

  getValidMoves(board: ChessBoard): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const directions = [
      { row: 0, col: 1 }, { row: 0, col: -1 },
      { row: 1, col: 0 }, { row: -1, col: 0 }
    ];

    for (const dir of directions) {
      for (let i = 1; i < 10; i++) { // Extended for 10x8 board
        const newPos = { row: this.row + dir.row * i, col: this.col + dir.col * i };

        if (!board.isValidPosition(newPos)) break;

        const piece = board.getPiece(newPos.row, newPos.col);
        if (!piece) {
          moves.push(newPos);
        } else {
          if (this.isOpponent(piece)) {
            moves.push(newPos);
          }
          break;
        }
      }
    }

    return moves;
  }
}

class Knight extends Piece {
  getType(): string { return 'knight'; }
  getImageKey(): string { return `knight_${this.color === 'white' ? 'w' : 'b'}`; }

  getValidMoves(board: ChessBoard): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const knightMoves = [
      { row: this.row + 2, col: this.col + 1 }, { row: this.row + 2, col: this.col - 1 },
      { row: this.row - 2, col: this.col + 1 }, { row: this.row - 2, col: this.col - 1 },
      { row: this.row + 1, col: this.col + 2 }, { row: this.row + 1, col: this.col - 2 },
      { row: this.row - 1, col: this.col + 2 }, { row: this.row - 1, col: this.col - 2 }
    ];

    for (const move of knightMoves) {
      if (board.isValidPosition(move)) {
        const piece = board.getPiece(move.row, move.col);
        if (!piece || this.isOpponent(piece)) {
          moves.push(move);
        }
      }
    }

    return moves;
  }
}

class Bishop extends Piece {
  getType(): string { return 'bishop'; }
  getImageKey(): string { return `bishop_${this.color === 'white' ? 'w' : 'b'}`; }

  getValidMoves(board: ChessBoard): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const directions = [
      { row: 1, col: 1 }, { row: 1, col: -1 },
      { row: -1, col: 1 }, { row: -1, col: -1 }
    ];

    for (const dir of directions) {
      for (let i = 1; i < 10; i++) { // Extended for 10x8 board
        const newPos = { row: this.row + dir.row * i, col: this.col + dir.col * i };

        if (!board.isValidPosition(newPos)) break;

        const piece = board.getPiece(newPos.row, newPos.col);
        if (!piece) {
          moves.push(newPos);
        } else {
          if (this.isOpponent(piece)) {
            moves.push(newPos);
          }
          break;
        }
      }
    }

    return moves;
  }
}

class Queen extends Piece {
  getType(): string { return 'queen'; }
  getImageKey(): string { return `queen_${this.color === 'white' ? 'w' : 'b'}`; }

  getValidMoves(board: ChessBoard): { row: number; col: number }[] {
    // Queen moves like both rook and bishop
    const rook = new Rook(this.color, this.row, this.col);
    const bishop = new Bishop(this.color, this.row, this.col);

    return [
      ...rook.getValidMoves(board),
      ...bishop.getValidMoves(board)
    ];
  }
}

class King extends Piece {
  getType(): string { return 'king'; }
  getImageKey(): string { return `king_${this.color === 'white' ? 'w' : 'b'}`; }

  getValidMoves(board: ChessBoard): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const directions = [
      { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 },
      { row: 0, col: -1 }, { row: 0, col: 1 },
      { row: 1, col: -1 }, { row: 1, col: 0 }, { row: 1, col: 1 }
    ];

    for (const dir of directions) {
      const newPos = { row: this.row + dir.row, col: this.col + dir.col };

      if (board.isValidPosition(newPos)) {
        const piece = board.getPiece(newPos.row, newPos.col);
        if (!piece || this.isOpponent(piece)) {
          moves.push(newPos);
        }
      }
    }

    return moves;
  }
}

class Mann extends Piece {
  getType(): string { return 'mann'; }
  getImageKey(): string { return `mann_${this.color === 'white' ? 'w' : 'b'}`; }

  getValidMoves(board: ChessBoard): { row: number; col: number }[] {
    const moves: { row: number; col: number }[] = [];
    const directions = [
      { row: -1, col: -1 }, { row: -1, col: 0 }, { row: -1, col: 1 },
      { row: 0, col: -1 }, { row: 0, col: 1 },
      { row: 1, col: -1 }, { row: 1, col: 0 }, { row: 1, col: 1 }
    ];

    for (const dir of directions) {
      const newPos = { row: this.row + dir.row, col: this.col + dir.col };

      if (board.isValidPosition(newPos)) {
        const piece = board.getPiece(newPos.row, newPos.col);
        if (!piece || this.isOpponent(piece)) {
          moves.push(newPos);
        }
      }
    }

    return moves;
  }
}

// =============================================================================
// CHESS BOARD CLASS
// =============================================================================

class ChessBoard {
  private pieces: (Piece | null)[][] = Array(8).fill(null).map(() => Array(10).fill(null));

  isValidPosition(pos: { row: number; col: number }): boolean {
    return pos.row >= 0 && pos.row < 8 && pos.col >= 0 && pos.col < 10;
  }

  getPiece(row: number, col: number): Piece | null {
    if (!this.isValidPosition({ row, col })) return null;
    return this.pieces[row][col];
  }

  setPiece(row: number, col: number, piece: Piece | null): void {
    if (this.isValidPosition({ row, col })) {
      this.pieces[row][col] = piece;
      if (piece) {
        piece.row = row;
        piece.col = col;
      }
    }
  }

  // Update board from server state
  updateFromServerState(serverPieces: any[]): void {
    // Clear current board
    this.pieces = Array(8).fill(null).map(() => Array(10).fill(null));

    // Recreate pieces from server state
    for (const serverPiece of serverPieces) {
      const piece = this.createPieceFromType(
        serverPiece.type,
        serverPiece.color,
        serverPiece.row,
        serverPiece.col
      );
      if (piece) {
        piece.hasMoved = serverPiece.hasMoved;
        this.setPiece(serverPiece.row, serverPiece.col, piece);
      }
    }
  }

  private createPieceFromType(type: string, color: 'white' | 'black', row: number, col: number): Piece | null {
    switch (type) {
      case 'pawn': return new Pawn(color, row, col);
      case 'rook': return new Rook(color, row, col);
      case 'knight': return new Knight(color, row, col);
      case 'bishop': return new Bishop(color, row, col);
      case 'queen': return new Queen(color, row, col);
      case 'king': return new King(color, row, col);
      case 'mann': return new Mann(color, row, col);
      default: return null;
    }
  }

  getAllPieces(): Piece[] {
    const pieces: Piece[] = [];
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 10; col++) {
        const piece = this.pieces[row][col];
        if (piece) pieces.push(piece);
      }
    }
    return pieces;
  }
}

// =============================================================================
// NETWORKED GAME CONTROLLER
// =============================================================================

class NetworkedChessGame {
  private board = new ChessBoard();
  private currentPlayer: 'white' | 'black' = 'white';
  private selectedPiece: Piece | null = null;
  private gameStatus = 'waiting';

  constructor() {
    // Board will be initialized from server
  }

  getBoard(): ChessBoard {
    return this.board;
  }

  getCurrentPlayer(): 'white' | 'black' {
    return this.currentPlayer;
  }

  getSelectedPiece(): Piece | null {
    return this.selectedPiece;
  }

  getGameStatus(): string {
    return this.gameStatus;
  }

  // Update game state from server
  updateFromServer(roomState: any): void {
    this.board.updateFromServerState(roomState.pieces);
    this.currentPlayer = roomState.currentTurn;
    this.gameStatus = roomState.gameStatus;

    // Update local selection based on server state
    if (roomState.selectedPiecePlayer === playerSessionId) {
      this.selectedPiece = this.board.getPiece(roomState.selectedRow, roomState.selectedCol);
    } else {
      this.selectedPiece = null;
    }
  }

  selectPiece(row: number, col: number): boolean {
    const piece = this.board.getPiece(row, col);

    if (!piece || piece.color !== playerColor || this.currentPlayer !== playerColor) {
      return false;
    }

    // Send selection to server
    if (room) {
      room.send("select", { row, col });
    }

    return true;
  }

  deselectPiece(): void {
    if (room) {
      room.send("deselect");
    }
  }

  getValidMovesForSelected(): { row: number; col: number }[] {
    if (!this.selectedPiece) return [];
    return this.selectedPiece.getValidMoves(this.board);
  }

  makeMove(toRow: number, toCol: number): boolean {
    if (!this.selectedPiece || playerColor === 'spectator') return false;

    const validMoves = this.getValidMovesForSelected();
    const isValidMove = validMoves.some(move => move.row === toRow && move.col === toCol);

    if (!isValidMove) return false;

    // Send move to server
    if (room) {
      room.send("move", {
        fromRow: this.selectedPiece.row,
        fromCol: this.selectedPiece.col,
        toRow,
        toCol
      });
    }

    return true;
  }

  canPlayerAct(): boolean {
    return playerColor !== 'spectator' &&
      this.currentPlayer === playerColor &&
      this.gameStatus === 'playing';
  }
}

// =============================================================================
// COLYSEUS CONNECTION FUNCTIONS
// =============================================================================

async function connectToRoom(): Promise<void> {
  try {
    // Initialize Colyseus client
    client = new Client("wss://chess-server-9na6.onrender.com/"); // Update with your server URL

    // Join the chess room
    room = await client.joinOrCreate<ChessRoomState>("chess_room", {
      name: `Player_${Math.random().toString(36).substr(2, 6)}`
    });

    playerSessionId = room.sessionId;
    console.log("Connected to room with session ID:", playerSessionId);

    // Set up room event handlers
    room.onStateChange((state) => {
      console.log("Room state changed");
      chessGame.updateFromServer(state);
      if (currentScene) {
        updatePieceSprites(currentScene);
        updateTurnIndicator(currentScene);
        updateGameStatus(currentScene);
        clearHighlights(currentScene);
      }
    });

    room.onMessage("gameState", (message) => {
      console.log("Received game state:", message);
      playerColor = message.color;
      updatePlayerInfo();
    });

    room.onMessage("playerJoined", (message) => {
      console.log("Player joined:", message);
    });

    room.onMessage("__playground_message_types", (message) => {
      console.log("Playground types:", message);
    });

    room.onMessage("moveExecuted", (message) => {
      console.log("Move executed:", message);
      // Visual feedback for moves will be handled by state change
    });

    room.onMessage("pieceSelected", (message) => {
      console.log("Piece selected:", message);
      if (currentScene && message.player !== playerColor) {
        showOpponentSelection(currentScene, message.row, message.col);
      }
    });

    room.onMessage("pieceDeselected", (message) => {
      console.log("Piece deselected:", message);
      if (currentScene) {
        clearOpponentSelection(currentScene);
      }
    });

    room.onMessage("error", (message) => {
      console.error("Game error:", message.message);
      showError(message.message);
    });

    room.onMessage("gameRestarted", () => {
      console.log("Game restarted");
      if (currentScene) {
        clearHighlights(currentScene);
      }
    });

    room.onLeave((code) => {
      console.log("Left room with code:", code);
    });

  } catch (error) {
    console.error("Failed to connect to room:", error);
    showError("Failed to connect to game server");
  }
}

function updatePlayerInfo(): void {
  const playerInfoElement = document.getElementById('player-info');
  if (playerInfoElement) {
    playerInfoElement.textContent = `You are playing as: ${playerColor}`;
  }
}

function showError(message: string): void {
  const errorElement = document.getElementById('error-message');
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 3000);
  }
}

// =============================================================================
// PHASER INTEGRATION
// =============================================================================

let chessGame = new NetworkedChessGame();
let pieceSprites: (Phaser.GameObjects.Image | null)[][] = [];
let highlightSquares: Phaser.GameObjects.Rectangle[] = [];
let opponentSelectionHighlight: Phaser.GameObjects.Rectangle | null = null;
let currentScene: Phaser.Scene | null = null;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1000,
  height: 900, // Increased height for UI elements
  backgroundColor: "#f0d9b5",
  parent: "game-container",
  scene: {
    preload,
    create,
    update,
  },
};

// Connect to room before starting Phaser
connectToRoom().then(() => {
  new Phaser.Game(config);
});

function preload(this: Phaser.Scene) {
  const pieces = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king', 'mann'];
  const colors = ['b', 'w'];

  pieces.forEach(piece => {
    colors.forEach(color => {
      this.load.image(`${piece}_${color}`, `/chess_peices/${piece}_${color}.svg`);
    });
  });
}

function create(this: Phaser.Scene) {
  currentScene = this;
  const tileSize = 100;
  const rows = 8;
  const cols = 10;

  pieceSprites = Array(8).fill(null).map(() => Array(10).fill(null));

  // Create the chessboard
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isLight = (row + col) % 2 === 0;
      const color = isLight ? 0xf0d9b5 : 0xb58863;

      const square = this.add.rectangle(
        col * tileSize,
        row * tileSize,
        tileSize,
        tileSize,
        color,
        1
      );

      square.setOrigin(0);
      square.setInteractive();
      square.on('pointerdown', () => handleSquareClick(this, row, col));
    }
  }

  // UI Elements
  const turnText = this.add.text(10, 810, 'Connecting...', {
    fontSize: '24px',
    color: '#000000'
  });
  turnText.setName('turnText');

  const gameStatusText = this.add.text(10, 840, 'Game Status: Waiting', {
    fontSize: '20px',
    color: '#000000'
  });
  gameStatusText.setName('gameStatusText');

  const playerInfoText = this.add.text(10, 870, `Player: ${playerColor}`, {
    fontSize: '18px',
    color: '#000000'
  });
  playerInfoText.setName('playerInfoText');

  // Restart button (only for players)
  const restartButton = this.add.text(400, 820, 'Restart Game', {
    fontSize: '20px',
    color: '#ffffff',
    backgroundColor: '#666666',
    padding: { x: 10, y: 5 }
  });
  restartButton.setInteractive();
  restartButton.on('pointerdown', () => {
    if (room && playerColor !== 'spectator') {
      room.send("restart");
    }
  });

  updatePieceSprites(this);
}

function updatePieceSprites(scene: Phaser.Scene) {
  const tileSize = 100;

  // Clear existing sprites
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 10; col++) {
      if (pieceSprites[row][col]) {
        pieceSprites[row][col]!.destroy();
        pieceSprites[row][col] = null;
      }
    }
  }

  // Create new sprites for all pieces
  const allPieces = chessGame.getBoard().getAllPieces();

  for (const piece of allPieces) {
    const sprite = scene.add.image(
      piece.col * tileSize + tileSize / 2,
      piece.row * tileSize + tileSize / 2,
      piece.getImageKey()
    );

    sprite.setScale(1.5);
    sprite.setInteractive();

    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer, localX: number, localY: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      handlePieceClick(scene, piece.row, piece.col);
    });

    pieceSprites[piece.row][piece.col] = sprite;
  }
}

function handlePieceClick(scene: Phaser.Scene, row: number, col: number) {
  if (!chessGame.canPlayerAct()) return;

  const piece = chessGame.getBoard().getPiece(row, col);
  if (!piece) return;

  // If trying to capture or there's no selection, try to select
  if (!chessGame.getSelectedPiece() || chessGame.getSelectedPiece()!.color !== piece.color) {
    // Try to make a move if there's a selected piece
    if (chessGame.getSelectedPiece()) {
      chessGame.makeMove(row, col);
      return;
    }

    // Try to select the piece
    if (chessGame.selectPiece(row, col)) {
      clearHighlights(scene);
      highlightSelectedPiece(scene, row, col);
      showValidMoves(scene);
    }
  } else {
    // Clicking same piece - deselect
    if (chessGame.getSelectedPiece() === piece) {
      chessGame.deselectPiece();
      clearHighlights(scene);
    }
  }
}

function handleSquareClick(scene: Phaser.Scene, row: number, col: number) {
  if (!chessGame.canPlayerAct()) return;

  // If there's a piece on this square, let piece click handle it
  if (chessGame.getBoard().getPiece(row, col)) return;

  // Try to move selected piece to empty square
  chessGame.makeMove(row, col);
}

function highlightSelectedPiece(scene: Phaser.Scene, row: number, col: number) {
  const sprite = pieceSprites[row][col];
  if (sprite) {
    sprite.setTint(0x00ff00);
  }
}

function showValidMoves(scene: Phaser.Scene) {
  const tileSize = 100;
  const validMoves = chessGame.getValidMovesForSelected();

  for (const move of validMoves) {
    const highlight = scene.add.rectangle(
      move.col * tileSize + tileSize / 2,
      move.row * tileSize + tileSize / 2,
      tileSize,
      tileSize,
      0x00ff00,
      0.3
    );
    highlightSquares.push(highlight);
  }
}

function showOpponentSelection(scene: Phaser.Scene, row: number, col: number) {
  clearOpponentSelection(scene);

  const tileSize = 100;
  opponentSelectionHighlight = scene.add.rectangle(
    col * tileSize + tileSize / 2,
    row * tileSize + tileSize / 2,
    tileSize,
    tileSize,
    0xff0000,
    0.3
  );
}

function clearOpponentSelection(scene: Phaser.Scene) {
  if (opponentSelectionHighlight) {
    opponentSelectionHighlight.destroy();
    opponentSelectionHighlight = null;
  }
}

function clearHighlights(scene: Phaser.Scene) {
  // Clear piece tints
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 10; col++) {
      const sprite = pieceSprites[row][col];
      if (sprite) {
        sprite.clearTint();
      }
    }
  }

  // Clear move highlights
  highlightSquares.forEach(highlight => highlight.destroy());
  highlightSquares = [];

  // Clear opponent selection
  clearOpponentSelection(scene);
}

function updateTurnIndicator(scene: Phaser.Scene) {
  const turnText = scene.children.getByName('turnText') as Phaser.GameObjects.Text;
  if (turnText) {
    const currentTurn = chessGame.getCurrentPlayer();
    const isMyTurn = currentTurn === playerColor;
    turnText.setText(`Current turn: ${currentTurn} ${isMyTurn ? '(Your turn!)' : ''}`);
  }
}

function updateGameStatus(scene: Phaser.Scene) {
  const gameStatusText = scene.children.getByName('gameStatusText') as Phaser.GameObjects.Text;
  const playerInfoText = scene.children.getByName('playerInfoText') as Phaser.GameObjects.Text;

  if (gameStatusText) {
    gameStatusText.setText(`Game Status: ${chessGame.getGameStatus()}`);
  }

  if (playerInfoText) {
    playerInfoText.setText(`Player: ${playerColor}`);
  }
}

function update(this: Phaser.Scene, time: number, delta: number) {
  // Game loop (empty for now)
}