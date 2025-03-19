import { useState } from 'react';
import { canvasHeight, canvasWidth, pixelSize } from './config';
import { useQuery } from '@tanstack/react-query';

type PixelCommand = {
  actor: string;
  x: number;
  y: number;
  colour: string;
  timestamp: string;
};

type ProcessedData = {
  canvas: string[][];
  history: PixelCommand[];
  stats: {
    [actor: string]: {
      pixelsPlaced: number;
      lastPlaced: string | null;
      colours: { [colour: string]: number };
    };
  };
  lastUpdate: string;
};

const useHandleResolver = (did: string) => {
  return useQuery({
    queryKey: ['did-to-handle', did],
    queryFn: () => fetch(`https://plc.directory/${did}`).then((res) => res.json()),
    select: (data: { alsoKnownAs: string[] }) => (data.alsoKnownAs?.[0] ? `@${data.alsoKnownAs?.[0].split('//')[1]}` : did),
  });
};

const usePixelCommands = () => {
  const { data } = useQuery<PixelCommand[], unknown, ProcessedData>({
    queryKey: ['pixel-commands'],
    queryFn: () => fetch('/data').then((res) => res.json()),
    refetchInterval: 1_000,
    select: (data: PixelCommand[]) => {
      // Sort commands by timestamp
      const sortedCommands = [...data].sort(
        (a: PixelCommand, b: PixelCommand) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      // Initialize canvas
      const canvas: string[][] = Array(canvasHeight)
        .fill(null)
        .map(() => Array(canvasWidth).fill('#FFFFFF'));

      // Initialize stats
      const stats: ProcessedData['stats'] = {};

      // Process all commands in order
      sortedCommands.forEach(({ actor, x, y, colour, timestamp }) => {
        // Update canvas
        canvas[y][x] = colour;

        // Update stats
        if (!stats[actor]) {
          stats[actor] = {
            pixelsPlaced: 0,
            lastPlaced: null,
            colours: {},
          };
        }
        stats[actor].pixelsPlaced += 1;
        stats[actor].lastPlaced = timestamp;
        stats[actor].colours[colour] = (stats[actor].colours[colour] || 0) + 1;
      });

      return {
        canvas,
        history: sortedCommands.slice(-100), // Keep last 100 changes
        stats,
        lastUpdate: sortedCommands[sortedCommands.length - 1]?.timestamp || new Date().toISOString(),
      };
    },
  });

  return data;
};

// Render the canvas
const Canvas = ({
  canvas,
  handlePixelHover,
  handlePixelLeave,
  hoveredPixel,
}: {
  canvas: string[][];
  handlePixelHover: (x: number, y: number) => void;
  handlePixelLeave: () => void;
  hoveredPixel: { x: number; y: number } | null;
}) => {
  return (
    <div className="relative bg-zinc-200 dark:bg-zinc-800 p-2 rounded-lg shadow-inner">
      <div
        className="grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${canvasWidth}, ${pixelSize}px)`,
          gridTemplateRows: `repeat(${canvasHeight}, ${pixelSize}px)`,
          gap: '0px',
        }}
      >
        {canvas.map((row: string[], y: number) =>
          row.map((colour: string, x: number) => (
            <div
              key={`${x}-${y}`}
              className="relative cursor-pointer transition-colours duration-150 hover:opacity-90"
              style={{
                backgroundColor: colour,
                width: `${pixelSize}px`,
                height: `${pixelSize}px`,
                border: '0.5px solid rgba(0,0,0,0.1)',
              }}
              onMouseEnter={() => handlePixelHover(x, y)}
              onMouseLeave={handlePixelLeave}
            />
          )),
        )}
      </div>

      {/* Coordinates overlay */}
      {hoveredPixel && (
        <div
          className="absolute bg-black dark:bg-white bg-opacity-70 dark:bg-opacity-70 text-white dark:text-black px-2 py-1 text-xs rounded-md shadow-md"
          style={{
            left: hoveredPixel.x * pixelSize + pixelSize * 0.5,
            top: hoveredPixel.y * pixelSize - 20,
            transform: 'translateX(-50%)',
          }}
        >
          {hoveredPixel.x}, {hoveredPixel.y}
        </div>
      )}
    </div>
  );
};

const History = ({ pixel }: { pixel: PixelCommand }) => {
  const { data: handle } = useHandleResolver(pixel.actor);
  return (
    <div className="flex items-center px-2 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-md">
      <div
        className="w-4 h-4 mr-2 rounded-sm"
        style={{
          backgroundColor: pixel.colour,
          border: '1px solid rgba(0,0,0,0.1)',
        }}
      />
      <div className="font-medium dark:text-white">{handle}</div>
      <div className="text-gray-500 dark:text-gray-400 ml-2">
        at ({pixel.x}, {pixel.y})
      </div>
      <div className="ml-auto text-xs text-gray-400 dark:text-gray-500">
        {new Date(pixel.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
};

const PixelHistory = ({ pixelHistory }: { pixelHistory: PixelCommand[] }) => {
  return (
    <div className="mt-4 bg-white dark:bg-zinc-800 p-2 rounded-lg shadow max-h-48 overflow-y-auto">
      <h3 className="text-md font-semibold mb-2 px-2 dark:text-white">Recent Pixel Placements</h3>
      <div className="space-y-1">
        {pixelHistory
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 10)
          .map((pixel: PixelCommand, index: number) => (
            <History key={index} pixel={pixel} />
          ))}
      </div>
    </div>
  );
};

const Contributor = ({
  actor,
  userStats,
  index,
}: {
  actor: string;
  userStats: ProcessedData['stats'][string];
  index: number;
}) => {
  const { data: handle } = useHandleResolver(actor);
  return (
    <div className="flex items-center px-2 py-1 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded-md">
      <div className="font-medium w-6 text-center dark:text-white">{index + 1}.</div>
      <div className="font-medium dark:text-white">{handle}</div>
      <div className="ml-auto text-xs dark:text-gray-400">
        {userStats.pixelsPlaced} pixel{userStats.pixelsPlaced !== 1 ? 's' : ''}
      </div>
    </div>
  );
};

// Render top contributors
const TopContributors = ({ stats }: { stats: ProcessedData['stats'] }) => {
  const contributors = Object.entries(stats)
    .sort(([, a], [, b]) => b.pixelsPlaced - a.pixelsPlaced)
    .slice(0, 5);

  return (
    <div className="mt-4 bg-white dark:bg-zinc-800 p-2 rounded-lg shadow">
      <h3 className="text-md font-semibold mb-2 px-2 dark:text-white">Top Contributors</h3>
      <div className="space-y-1">
        {contributors.map(([actor, userStats], index) => (
          <Contributor key={actor} actor={actor} userStats={userStats} index={index} />
        ))}
      </div>
    </div>
  );
};

const Instructions = () => {
  return (
    <div className="mt-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 p-4 rounded-lg text-sm">
      <h3 className="text-md font-bold text-blue-800 dark:text-blue-200 mb-2">How to Play on BlueSky:</h3>
      <p className="mb-2 dark:text-white">
        1. Reply to{' '}
        <a
          href="https://bsky.app/profile/imlunahey.com/post/3lkqdcmcync2n"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          this post
        </a>{' '}
        with your pixel placement in this format:
      </p>
      <div className="font-mono bg-white dark:bg-zinc-800 border border-blue-100 dark:border-blue-700 p-2 rounded-md my-2 text-sm dark:text-white">
        pixel x,y #colour
      </div>
      <p className="mb-2 dark:text-white">
        Example: <span className="font-mono bg-blue-100 dark:bg-blue-800 px-1">pixel 15,20 #FF0000</span>
      </p>
      <p className="mb-2 dark:text-white">2. Use any hex colour code (e.g. #FF0000 for red)</p>
      <div className="flex flex-wrap gap-1 bg-white dark:bg-zinc-800 p-2 rounded-md mb-2">
        <div className="flex items-center">
          <div
            className="w-4 h-4 mr-1 rounded-sm"
            style={{
              backgroundColor: '#FF0000',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          />
          <code className="text-xs dark:text-white">#FF0000</code>
        </div>
        <div className="flex items-center">
          <div
            className="w-4 h-4 mr-1 rounded-sm"
            style={{
              backgroundColor: '#00FF00',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          />
          <code className="text-xs dark:text-white">#00FF00</code>
        </div>
        <div className="flex items-center">
          <div
            className="w-4 h-4 mr-1 rounded-sm"
            style={{
              backgroundColor: '#0000FF',
              border: '1px solid rgba(0,0,0,0.1)',
            }}
          />
          <code className="text-xs dark:text-white">#0000FF</code>
        </div>
      </div>
      <p className="dark:text-white">3. The canvas updates live as pixels are placed!</p>
    </div>
  );
};

const BlueSkyPlace = () => {
  const data = usePixelCommands();
  const [hoveredPixel, setHoveredPixel] = useState<{ x: number; y: number } | null>(null);

  // Handle pixel hover (for coordinates display)
  const handlePixelHover = (x: number, y: number) => {
    setHoveredPixel({ x, y });
  };

  // Handle pixel leave
  const handlePixelLeave = () => {
    setHoveredPixel(null);
  };

  if (!data) return null;

  const { canvas, history, stats, lastUpdate } = data;

  // Main component render
  return (
    <div className="flex flex-col items-center p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-2 dark:text-white">BlueSky r/place</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-4">A collaborative pixel canvas built through replies</p>

      <div className="flex flex-col gap-4 w-full">
        <div className="flex flex-col items-center">
          <Canvas
            canvas={canvas}
            handlePixelHover={handlePixelHover}
            handlePixelLeave={handlePixelLeave}
            hoveredPixel={hoveredPixel}
          />
        </div>

        <div className="flex-1 min-w-0">
          <Instructions />
          <PixelHistory pixelHistory={history} />
          <TopContributors stats={stats} />
        </div>
      </div>

      <div className="mt-6 text-xs text-gray-500 dark:text-gray-400">
        Last updated: {new Date(lastUpdate).toLocaleString()}
      </div>
    </div>
  );
};

export default BlueSkyPlace;
