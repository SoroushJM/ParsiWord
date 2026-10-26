import { createContext } from 'react';

export type ImageResolver = (source: string) => Promise<string | null>;
/** Node-view portals inherit this context without recreating the rich editor. */
export const ImageResolverContext = createContext<ImageResolver | undefined>(undefined);
