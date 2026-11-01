import { json, parse, route } from '@/lib/http';
import { idParam } from '@/lib/validation/schemas';
import { requireUser } from '@/lib/auth/guards';
import { badRequest } from '@/lib/errors';
import { MAX_IMAGE_BYTES } from '@/lib/services/uploadService';
import * as reportService from '@/lib/services/reportService';

export const POST = route(async (request, params) => {
  const user = await requireUser();
  const { id } = parse(idParam, params);
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024) throw badRequest('Images must be 5 MB or smaller');
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  return json({ image: await reportService.addImage(user, id, file) }, 201);
});
