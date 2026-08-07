export type SavedCollectionResponse = {
  id: string;
  name: string;
  postCount: number;
  postIds: string[];
};

export type SavedPostStateResponse = {
  id: string;
  isSaved: boolean;
};
