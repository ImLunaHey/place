//   // Parse a command from a Bluesky reply
//   const parseCommand = (replyText: string) => {
//     // Format: @username: pixel x,y #RRGGBB
//     const regex = /@(\w+):\s*pixel\s*(\d+),\s*(\d+)\s*(#[0-9A-Fa-f]{6})/g;
//     const commands: {
//       username: string;
//       x: number;
//       y: number;
//       color: string;
//     }[] = [];
//     let match;

//     while ((match = regex.exec(replyText)) !== null) {
//       const username = match[1];
//       const x = parseInt(match[2], 10);
//       const y = parseInt(match[3], 10);
//       const color = match[4].toUpperCase();

//       // Validate coordinates and color
//       if (
//         x >= 0 &&
//         x < canvasWidth &&
//         y >= 0 &&
//         y < canvasHeight &&
//         colorPalette.includes(color)
//       ) {
//         commands.push({ username, x, y, color });
//       }
//     }

//     return commands;
//   };
