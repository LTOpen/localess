import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostListener,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Schema, SchemaFieldKind, SchemaType } from '@shared/models/schema.model';
import { FormErrorHandlerService } from '@core/error-handler/form-error-handler.service';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { SchemaService } from '@shared/services/schema.service';
import { ContentService } from '@shared/services/content.service';
import { ContentData, ContentDocument, ContentError, ContentKind, EditorEvent } from '@shared/models/content.model';
import { distinctUntilChanged, filter, switchMap } from 'rxjs/operators';
import { combineLatest, Observable } from 'rxjs';
import { SpaceService } from '@shared/services/space.service';
import { Space, SpaceEnvironment } from '@shared/models/space.model';
import { NotificationService } from '@shared/services/notification.service';
import { DEFAULT_LOCALE, Locale } from '@shared/models/locale.model';
import { v4 } from 'uuid';
import { ContentHelperService } from '@shared/services/content-helper.service';
import { SchemaPathItem } from './edit-document.model';
import { SchemaSelectChange } from '../edit-document-schema/edit-document-schema.model';
import { ObjectUtils } from '@core/utils/object-utils.service';
import { TokenService } from '@shared/services/token.service';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { ContentHistory } from '@shared/models/content-history.model';
import { ContentHistoryService } from '@shared/services/content-history.service';
import { SpaceStore } from '@shared/store/space.store';
import { SettingsStore } from '@shared/store/settings.store';

@Component({
  selector: 'll-content-document-edit',
  templateUrl: './edit-document.component.html',
  styleUrls: ['./edit-document.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditDocumentComponent implements OnInit {
  // Input
  spaceId = input.required<string>();
  contentId = input.required<string>();

  showHistory = false;

  selectedSpace?: Space;
  selectedLocale: Locale = DEFAULT_LOCALE;
  selectedEnvironment?: SpaceEnvironment;
  iframeUrl?: SafeUrl;
  availableLocales: Locale[] = [];
  availableLocalesMap: Map<string, string> = new Map<string, string>();
  document?: ContentDocument;
  documentData: ContentData = { _id: '', schema: '' };
  selectedDocumentData: ContentData = { _id: '', schema: '' };
  documentIdsTree: Map<string, string[]> = new Map<string, string[]>();
  rootSchema?: Schema;
  schemaMapByName?: Map<string, Schema>;
  schemaPath: SchemaPathItem[] = [];
  schemas: Schema[] = [];
  contentErrors: ContentError[] = [];
  documents: ContentDocument[] = [];

  //Loadings
  isLoading = signal(true);
  isPublishLoading = signal(false);
  isSaveLoading = signal(false);
  //Store
  spaceStore = inject(SpaceStore);
  settingsStore = inject(SettingsStore);
  // Subscriptions
  history$?: Observable<ContentHistory[]>;

  private destroyRef = inject(DestroyRef);

  constructor(
    private readonly fb: FormBuilder,
    private readonly router: Router,
    private readonly cd: ChangeDetectorRef,
    private readonly spaceService: SpaceService,
    private readonly schemaService: SchemaService,
    private readonly contentService: ContentService,
    private readonly contentHistoryService: ContentHistoryService,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
    private readonly contentHelperService: ContentHelperService,
    private readonly sanitizer: DomSanitizer,
    readonly fe: FormErrorHandlerService
  ) {
    toObservable(this.spaceStore.selectedSpaceId)
      .pipe(
        distinctUntilChanged(),
        filter(it => it !== undefined), // Skip initial data
        switchMap(it =>
          combineLatest([
            this.spaceService.findById(it!),
            this.contentService.findById(it!, this.contentId()),
            this.contentService.findAllDocuments(it!),
            this.schemaService.findAll(it!),
          ])
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ([space, document, documents, schemas]) => {
          this.selectedSpace = space;
          //this.selectedLocale = space.localeFallback;
          this.availableLocales = [DEFAULT_LOCALE, ...space.locales];
          this.availableLocalesMap = new Map<string, string>(this.availableLocales.map(it => [it.id, it.name]));
          this.documents = documents;
          //console.log(ObjectUtils.clone(document))

          if (document.kind === ContentKind.DOCUMENT) {
            this.document = document;
            this.rootSchema = schemas.find(it => it.id === document.schema);
            this.documentData = document.data || {
              _id: v4(),
              schema: this.rootSchema?.name || '',
            };
          }

          // Generate initial path only once
          if (this.rootSchema && this.schemaPath.length == 0) {
            this.schemaPath = [
              {
                contentId: this.documentData._id,
                schemaName: this.documentData.schema,
                fieldName: '',
              },
            ];
          }

          // Select content base on path
          this.navigateToSchemaBackwards(this.schemaPath[this.schemaPath.length - 1]);
          // Select Environment
          if (this.selectedEnvironment === undefined && space.environments && space.environments.length > 0) {
            this.changeEnvironment(space.environments[0]);
          }
          this.schemas = schemas;
          this.schemaMapByName = new Map<string, Schema>(this.schemas?.map(it => [it.name, it]));
          this.generateDocumentIdsTree();
          this.isLoading.set(false);
          this.cd.markForCheck();
        },
      });
  }

  ngOnInit(): void {
    this.history$ = this.contentHistoryService.findAll(this.spaceId(), this.contentId());
  }

  publish(): void {
    this.isPublishLoading.set(true);
    this.contentService.publish(this.spaceId(), this.contentId()).subscribe({
      next: () => {
        this.notificationService.success('Content has been published.');
      },
      error: () => {
        this.notificationService.error('Content can not be published.');
      },
      complete: () => {
        setTimeout(() => {
          this.isPublishLoading.set(false);
          this.cd.markForCheck();
        }, 1000);
      },
    });
  }

  save(): void {
    //console.group('save')
    this.isSaveLoading.set(true);

    //console.log('documentData', this.documentData)
    //console.log('document', this.document)
    this.contentErrors = [];
    this.contentErrors.push(...this.contentHelperService.validateContent(this.documentData, this.schemas, DEFAULT_LOCALE.id));
    for (const locale of this.selectedSpace?.locales || []) {
      this.contentErrors.push(...this.contentHelperService.validateContent(this.documentData, this.schemas, locale.id));
    }

    //console.log(this.contentErrors)

    if (this.contentErrors.length === 0) {
      this.contentService.updateDocumentData(this.spaceId(), this.contentId(), this.documentData).subscribe({
        next: () => {
          this.notificationService.success('Content has been updated.');
        },
        error: () => {
          this.notificationService.error('Content can not be updated.');
        },
        complete: () => {
          setTimeout(() => {
            this.isSaveLoading.set(false);
            this.cd.markForCheck();
          }, 1000);
        },
      });
    } else {
      this.notificationService.warn('Content is not valid. Please check all fields are filled correctly.');
      this.isSaveLoading.set(false);
    }
    //console.groupEnd()
  }

  back(): void {
    this.router.navigate(['features', 'spaces', this.spaceId(), 'contents']);
  }

  openDraftInNewTab(locale: string): void {
    this.tokenService.findFirst(this.spaceId()).subscribe({
      next: tokens => {
        if (tokens.length === 1) {
          const url = new URL(`${location.origin}/api/v1/spaces/${this.spaceId()}/contents/${this.contentId()}`);
          url.searchParams.set('locale', locale);
          url.searchParams.set('version', 'draft');
          url.searchParams.set('token', tokens[0].id);
          window.open(url, '_blank');
        } else {
          this.notificationService.warn('Please create Access Token in your Space Settings');
        }
      },
    });
  }

  openPublishedInNewTab(locale: string): void {
    this.tokenService.findFirst(this.spaceId()).subscribe({
      next: tokens => {
        if (tokens.length === 1) {
          const url = new URL(`${location.origin}/api/v1/spaces/${this.spaceId()}/contents/${this.contentId()}`);
          url.searchParams.set('locale', locale);
          url.searchParams.set('token', tokens[0].id);
          window.open(url, '_blank');
        } else {
          this.notificationService.warn('Please create Access Token in your Space Settings');
        }
      },
    });
  }

  onLocaleChanged(locale: Locale): void {
    this.selectedLocale = locale;
  }

  onSchemaChange(event: SchemaSelectChange): void {
    this.navigateToSchemaForwards({
      contentId: event.contentId,
      schemaName: event.schemaName,
      fieldName: event.fieldName,
    });
  }

  navigateToSchemaForwards(pathItem: SchemaPathItem): void {
    //console.group('navigateToSchemaForwards')
    //console.log(pathItem)
    this.schemaPath.push(pathItem);
    const field = this.selectedDocumentData[pathItem.fieldName];
    if (Array.isArray(field)) {
      this.selectedDocumentData = field.find((it: ContentData) => it._id == pathItem.contentId);
    } else {
      this.selectedDocumentData = field;
    }
    //console.groupEnd()
  }

  navigateToSchemaBackwards(pathItem: SchemaPathItem): void {
    //console.group('navigateToSchemaBackwards')
    //console.log('pathItem', pathItem)
    const idx = this.schemaPath.findIndex(it => it.contentId == pathItem.contentId);
    this.schemaPath.splice(idx + 1);
    // Select Root
    if (idx == 0) {
      //console.log(`Navigate to Root idx=${idx}`)
      //console.log('documentData', ObjectUtils.clone(this.documentData))
      this.selectedDocumentData = this.documentData;
    } else {
      //console.log(`Navigate to Child idx=${idx}`)
      let localSelectedContent = this.documentData;
      for (const path of this.schemaPath) {
        if (path.fieldName === '') continue;
        const field = localSelectedContent[path.fieldName];
        if (Array.isArray(field)) {
          localSelectedContent = localSelectedContent[path.fieldName].find((it: ContentData) => it._id == path.contentId);
        } else {
          localSelectedContent = field;
        }
      }
      //console.log('localSelectedContent', localSelectedContent)
      this.selectedDocumentData = localSelectedContent;
    }
    //console.groupEnd()
  }

  changeEnvironment(env: SpaceEnvironment): void {
    this.selectedEnvironment = env;
    this.iframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(env.url);
  }

  generateDocumentIdsTree() {
    //console.group('generateDocumentIdsTree')
    const nodeIterator: { path: string[]; data: ContentData }[] = [{ path: [this.documentData._id], data: this.documentData }];
    let node = nodeIterator.shift();
    while (node) {
      this.documentIdsTree.set(node.data._id, node.path);
      const schema = this.schemaMapByName?.get(node.data.schema);
      if (schema && (schema.type === SchemaType.ROOT || schema.type === SchemaType.NODE)) {
        for (const field of schema.fields || []) {
          if (field.kind === SchemaFieldKind.SCHEMA) {
            const cData: ContentData | undefined = node.data[field.name];
            if (cData) {
              nodeIterator.push({ path: [...node.path, cData._id], data: cData });
            }
          }
          if (field.kind === SchemaFieldKind.SCHEMAS) {
            const cData: ContentData[] | undefined = node.data[field.name];
            for (const content of cData || []) {
              if (cData) {
                nodeIterator.push({ path: [...node.path, content._id], data: content });
              }
            }
          }
        }
      }
      node = nodeIterator.shift();
    }
    //console.log(this.documentIdsTree)
    //console.groupEnd()
  }

  @HostListener('window:message', ['$event'])
  contentIdLink(event: MessageEvent<EditorEvent>): void {
    if (event.isTrusted && event.data && event.data.owner === 'LOCALESS') {
      console.log('MessageEvent');
      console.log(event);
      // find element
      const contentIdIteration = ObjectUtils.clone(this.documentIdsTree.get(event.data.id)) || [];
      // Iterative traversing content and validating fields.
      let selectedContentId = contentIdIteration.shift();
      // check Root Schema
      if (this.documentData._id === selectedContentId) {
        console.log('root', selectedContentId);
        const schema = this.schemaMapByName?.get(this.documentData.schema);
        if (schema) {
          this.navigateToSchemaBackwards({
            contentId: this.documentData._id,
            schemaName: this.documentData.schema,
            fieldName: '',
          });
          selectedContentId = contentIdIteration.shift();
        } else {
          console.log(`schema ${this.selectedDocumentData.schema} not-found`);
          return;
        }
      } else {
        console.log(`root id ${selectedContentId} not-found`);
        return;
      }
      // Navigate to child
      while (selectedContentId) {
        console.log('child', selectedContentId);
        const schema = this.schemaMapByName?.get(this.selectedDocumentData.schema);
        if (schema && (schema.type === SchemaType.ROOT || schema.type === SchemaType.NODE)) {
          schemaFieldsLoop: for (const field of schema.fields || []) {
            if (field.kind === SchemaFieldKind.SCHEMA) {
              const cData: ContentData | undefined = this.selectedDocumentData[field.name];
              if (cData && cData._id === selectedContentId) {
                this.navigateToSchemaForwards({
                  contentId: selectedContentId!,
                  fieldName: field.name,
                  schemaName: cData.schema,
                });
                break;
              }
            }
            if (field.kind === SchemaFieldKind.SCHEMAS) {
              const cData: ContentData[] | undefined = this.selectedDocumentData[field.name];
              for (const content of cData || []) {
                if (content._id === selectedContentId) {
                  this.navigateToSchemaForwards({
                    contentId: selectedContentId,
                    fieldName: field.name,
                    schemaName: content.schema,
                  });
                  break schemaFieldsLoop;
                }
              }
            }
          }
          selectedContentId = contentIdIteration.shift();
        } else {
          console.log(`schema ${this.selectedDocumentData.schema} not-found`);
          return;
        }
      }
      console.log(`id ${selectedContentId} not-found`);
    }
  }
}
