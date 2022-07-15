import { Readable, Transform, pipeline, PassThrough, Writable } from 'stream';
import { Injectable } from '@nestjs/common';
import * as sharp from 'sharp';
import * as bytes from 'bytes';
import { S3 } from 'aws-sdk';

const s3 = new S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
});

@Injectable()
export class AppService {
  async upload(
    src: Readable,
    contentType: string,
    filename: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const isForbidden = this.isForbiddenType(contentType);
      if (isForbidden) {
        return reject(new Error(`${contentType} is not allowed!`));
      }

      const cb = (err?: Error) => (err ? reject(err) : resolve());
      const dst = this.isImage(contentType)
        ? this.createImageWritableStream(contentType, filename)
        : this.createDestinationStream(contentType, filename);

      pipeline(
        src.pipe(new PassThrough()),
        this.createSizeLimitStream(),
        dst,
        cb,
      );
    });
  }

  createSizeLimitStream() {
    const limit = bytes(process.env.FILE_SIZE_LIMIT);
    let len = 0;

    return new Transform({
      transform(chunk, _, cb) {
        len += chunk.length;

        const isValid = len < limit;
        cb(
          isValid ? null : new Error('Limit exceeded'),
          isValid ? chunk : null,
        );
      },
    });
  }

  createDestinationStream(contentType: string, filename: string) {
    const stream = new PassThrough();

    s3.upload(
      {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: filename,
        ContentType: contentType,
        Body: stream,
      },
      (err?: Error) => (err ? stream.destroy(err) : stream.destroy()),
    );

    return stream;
  }

  createImageWritableStream(contentType: string, filename: string) {
    const stream = new PassThrough();

    const cb = (err?: Error) => (err ? stream.destroy(err) : stream.destroy());

    pipeline(
      stream,
      this.createSmallImageResizerStream(),
      this.createDestinationStream(contentType, `${filename}-small`),
      cb,
    );
    pipeline(
      stream,
      this.createMediumImageResizerStream(),
      this.createDestinationStream(contentType, `${filename}-medium`),
      cb,
    );
    pipeline(
      stream,
      this.createLargeImageResizerStream(),
      this.createDestinationStream(contentType, `${filename}-large`),
      cb,
    );

    return stream;
  }

  createSmallImageResizerStream() {
    return sharp().resize(300, 300);
  }

  createMediumImageResizerStream() {
    return sharp().resize(1024, 1024);
  }

  createLargeImageResizerStream() {
    return sharp().resize(2048, 2048);
  }

  isImage(contentType: string) {
    return (
      [
        'image/gif',
        'image/jpeg',
        'image/png',
        'image/tiff',
        'image/svg+xml',
      ].indexOf(contentType) !== -1
    );
  }

  isForbiddenType(contentType: string) {
    return (process.env.FORBIDDEN_CONTENT_TYPE || '')
      .split(',')
      .includes(contentType);
  }
}
