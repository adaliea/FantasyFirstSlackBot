export interface PickColors {
  bg: string;
  text: string;
  ring: string;
}

export function pickColor(percentile: number): PickColors {
  if (percentile >= 0.90) return { bg: 'bg-emerald-500', text: 'text-white',    ring: 'ring-emerald-600' };
  if (percentile >= 0.75) return { bg: 'bg-green-400',   text: 'text-gray-900', ring: 'ring-green-500'   };
  if (percentile >= 0.50) return { bg: 'bg-yellow-300',  text: 'text-gray-900', ring: 'ring-yellow-500'  };
  if (percentile >= 0.25) return { bg: 'bg-orange-400',  text: 'text-white',    ring: 'ring-orange-500'  };
  return                          { bg: 'bg-red-500',     text: 'text-white',    ring: 'ring-red-600'     };
}
