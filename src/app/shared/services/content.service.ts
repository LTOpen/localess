import { Injectable } from '@angular/core';
import {
  addDoc,
  collection,
  collectionCount,
  collectionData,
  deleteDoc,
  doc,
  docData,
  DocumentReference,
  Firestore,
  limit,
  orderBy,
  query,
  QueryConstraint,
  serverTimestamp,
  UpdateData,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { from, Observable } from 'rxjs';
import { traceUntilFirst } from '@angular/fire/performance';
import { map } from 'rxjs/operators';
import {
  Content,
  ContentData,
  ContentDocument,
  ContentDocumentCreate,
  ContentDocumentCreateFS,
  ContentFolderCreate,
  ContentFolderCreateFS,
  ContentKind,
  ContentUpdate,
} from '@shared/models/content.model';
import { Functions, httpsCallableData } from '@angular/fire/functions';
import { ContentHelperService } from '@shared/services/content-helper.service';
import { NameUtils } from '@core/utils/name-utils.service';

@Injectable()
export class ContentService {
  constructor(
    private readonly firestore: Firestore,
    private readonly functions: Functions,
    private readonly contentHelperService: ContentHelperService
  ) {}

  findAll(spaceId: string, parentSlug?: string): Observable<Content[]> {
    const queryConstrains: QueryConstraint[] = [orderBy('kind', 'desc'), orderBy('name', 'asc')];
    if (parentSlug) {
      queryConstrains.push(where('parentSlug', '==', parentSlug));
    } else {
      queryConstrains.push(where('parentSlug', '==', ''));
    }

    return collectionData(query(collection(this.firestore, `spaces/${spaceId}/contents`), ...queryConstrains), { idField: 'id' }).pipe(
      traceUntilFirst('Firestore:Contents:findAll'),
      map(it => it as Content[])
    );
  }

  countAll(spaceId: string): Observable<number> {
    return collectionCount(collection(this.firestore, `spaces/${spaceId}/contents`)).pipe(traceUntilFirst('Firestore:Contents:countAll'));
  }

  findAllDocuments(spaceId: string): Observable<ContentDocument[]> {
    const queryConstrains: QueryConstraint[] = [where('kind', '==', ContentKind.DOCUMENT)];
    return collectionData(query(collection(this.firestore, `spaces/${spaceId}/contents`), ...queryConstrains), { idField: 'id' }).pipe(
      traceUntilFirst('Firestore:Contents:findAllDocuments'),
      map(it => it as ContentDocument[])
    );
  }

  findAllByName(spaceId: string, name: string, max = 20): Observable<Content[]> {
    const queryConstrains: QueryConstraint[] = [where('name', '>=', name), where('name', '<=', `${name}~`), limit(max)];

    return collectionData(query(collection(this.firestore, `spaces/${spaceId}/contents`), ...queryConstrains), { idField: 'id' }).pipe(
      traceUntilFirst('Firestore:Contents:findAllByName'),
      map(it => it as Content[])
    );
  }

  findAllDocumentsByName(spaceId: string, name: string, max = 20): Observable<ContentDocument[]> {
    const queryConstrains: QueryConstraint[] = [
      where('kind', '==', ContentKind.DOCUMENT),
      where('name', '>=', name),
      where('name', '<=', `${name}~`),
      limit(max),
    ];

    return collectionData(query(collection(this.firestore, `spaces/${spaceId}/contents`), ...queryConstrains), { idField: 'id' }).pipe(
      traceUntilFirst('Firestore:Contents:findAllDocumentsByName'),
      map(it => it as ContentDocument[])
    );
  }

  findById(spaceId: string, id: string): Observable<Content> {
    return docData(doc(this.firestore, `spaces/${spaceId}/contents/${id}`), { idField: 'id' }).pipe(
      traceUntilFirst('Firestore:Contents:findById'),
      map(it => it as Content)
    );
  }

  createDocument(spaceId: string, parentSlug: string, entity: ContentDocumentCreate): Observable<DocumentReference> {
    const addEntity: ContentDocumentCreateFS = {
      kind: ContentKind.DOCUMENT,
      name: entity.name,
      slug: entity.slug,
      parentSlug: parentSlug,
      fullSlug: parentSlug ? `${parentSlug}/${entity.slug}` : entity.slug,
      schema: entity.schema,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    return from(addDoc(collection(this.firestore, `spaces/${spaceId}/contents`), addEntity)).pipe(
      traceUntilFirst('Firestore:Contents:create')
    );
  }

  createFolder(spaceId: string, parentSlug: string, entity: ContentFolderCreate): Observable<DocumentReference> {
    const addEntity: ContentFolderCreateFS = {
      kind: ContentKind.FOLDER,
      name: entity.name,
      slug: entity.slug,
      parentSlug: parentSlug,
      fullSlug: parentSlug ? `${parentSlug}/${entity.slug}` : entity.slug,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    return from(addDoc(collection(this.firestore, `spaces/${spaceId}/contents`), addEntity)).pipe(
      traceUntilFirst('Firestore:Contents:create')
    );
  }

  update(spaceId: string, id: string, parentSlug: string, entity: ContentUpdate): Observable<void> {
    const update: UpdateData<Content> = {
      name: entity.name,
      slug: entity.slug,
      parentSlug: parentSlug,
      fullSlug: parentSlug ? `${parentSlug}/${entity.slug}` : entity.slug,
      updatedAt: serverTimestamp(),
    };
    return from(updateDoc(doc(this.firestore, `spaces/${spaceId}/contents/${id}`), update)).pipe(
      traceUntilFirst('Firestore:Contents:update')
    );
  }

  updateDocumentData(spaceId: string, id: string, data: ContentData): Observable<void> {
    const update: UpdateData<ContentDocument> = {
      data: this.contentHelperService.clone(data),
      updatedAt: serverTimestamp(),
    };

    return from(updateDoc(doc(this.firestore, `spaces/${spaceId}/contents/${id}`), update)).pipe(
      traceUntilFirst('Firestore:Contents:update')
    );
  }

  updateDocumentEditorEnabled(spaceId: string, id: string, enabled: boolean): Observable<void> {
    const update: UpdateData<ContentDocument> = {
      editorEnabled: enabled,
      updatedAt: serverTimestamp(),
    };

    return from(updateDoc(doc(this.firestore, `spaces/${spaceId}/contents/${id}`), update)).pipe(
      traceUntilFirst('Firestore:Contents:updateEditorEnabled')
    );
  }

  cloneDocument(spaceId: string, entity: ContentDocument): Observable<DocumentReference> {
    const nameSuffix = NameUtils.random(5);
    const addEntity: ContentDocumentCreateFS = {
      kind: ContentKind.DOCUMENT,
      name: `${entity.name} ${nameSuffix}`,
      slug: `${entity.slug}-${nameSuffix}`,
      parentSlug: entity.parentSlug,
      fullSlug: entity.parentSlug ? `${entity.parentSlug}/${entity.slug}-${nameSuffix}` : `${entity.slug}-${nameSuffix}`,
      schema: entity.schema,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (entity.data) {
      addEntity.data = entity.data;
    }

    return from(addDoc(collection(this.firestore, `spaces/${spaceId}/contents`), addEntity)).pipe(
      traceUntilFirst('Firestore:Contents:clone')
    );
  }

  delete(spaceId: string, element: Content): Observable<void> {
    return from(deleteDoc(doc(this.firestore, `spaces/${spaceId}/contents/${element.id}`))).pipe(
      traceUntilFirst('Firestore:Contents:delete')
    );
  }

  publish(spaceId: string, id: string): Observable<void> {
    const contentPublish = httpsCallableData<{ spaceId: string; contentId: string }, void>(this.functions, 'content-publish');
    return contentPublish({ spaceId, contentId: id }).pipe(traceUntilFirst('Functions:Contents:publish'));
  }
}
