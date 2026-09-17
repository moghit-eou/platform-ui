import { ExperimentFolder } from './experiment-folder.model';

/**
 * Wire shapes of `/services/experiment-folders`.
 *
 * Identity is never sent: the session cookie picks the owner server-side, so every route below is
 * scoped to the signed-in user and a different session simply gets a different set of rows.
 *
 * The contract the service speaks:
 *
 * | Call                                                    | Body                        | Result                     |
 * |---------------------------------------------------------|-----------------------------|----------------------------|
 * | `GET /experiment-folders`                               |                             | `{ folders: Folder[] }`    |
 * | `POST /experiment-folders`                              | `{ name, experimentUuid? }` | the created folder         |
 * | `PATCH /experiment-folders/{folderId}`                  | `{ name }`                  | the renamed folder         |
 * | `DELETE /experiment-folders/{folderId}`                 |                             | no content                 |
 * | `POST /experiment-folders/{folderId}/members`           | `{ experimentUuid }`        | the updated folder         |
 * | `DELETE /experiment-folders/{folderId}/members/{id}`    |                             | the updated folder         |
 * | `POST /experiment-folders/{folderId}/sets`              | `{ name, experimentUuid? }` | the updated folder         |
 * | `PATCH /experiment-folders/{folderId}/sets/{setId}`     | `{ name }`                  | the updated folder         |
 * | `DELETE /experiment-folders/{folderId}/sets/{setId}`    |                             | the updated folder         |
 * | `PATCH /experiment-folders/{folderId}/members/{id}/set` | `{ setId }` (null = ungroup) | the updated folder     |
 *
 * A name a sibling already carries comes back as `409`, which the service maps to the `null`/`false`
 * the inline "that name is taken" messages already speak. Every other route that changes a folder
 * returns the whole folder, so the client takes its state from the server instead of guessing.
 */
export interface BackendExperimentFoldersResponse {
  folders: ExperimentFolder[];
}
